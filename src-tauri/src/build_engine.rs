//! Asynchronous, cancellable build engine.
//!
//! Strategy:
//! 1. If `latexmk` is available and enabled, delegate all passes to it
//!    (`-pdf` / `-xelatex` / `-lualatex`, `-outdir`, `-f`).
//! 2. Otherwise run a manual pipeline:
//!    engine pass 1 → biber (if `.bcf`) or bibtex (if `\bibdata` in `.aux`)
//!    → engine pass 2 → up to 3 extra passes when the log asks for a rerun.
//!
//! Output is streamed to the frontend line-by-line through the Tauri event
//! `build://output`; completion is signalled with `build://finished`.
//! The current process can be killed at any time via `cancel_build`.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc;

use crate::error::{AppError, AppResult};
use crate::latex;
use crate::log_parser::{self, LogIssue};

/// Parameters for one build run (already validated by the command layer).
#[derive(Debug, Clone)]
pub struct BuildParams {
    pub project_root: PathBuf,
    pub main_file: String,      // relative, sanitized
    pub main_base: String,      // file stem of the main file
    pub output_dir_rel: String, // relative, sanitized
    pub engine: String,         // pdflatex | xelatex | lualatex
    pub engine_path: PathBuf,
    pub use_latexmk: bool,
    pub latexmk_path: Option<PathBuf>,
    pub shell_escape: bool,
    pub path_override: Option<String>,
}

pub struct BuildRun {
    pub id: u64,
    pub cancelled: Arc<AtomicBool>,
    /// Kill switch of the currently running subprocess (one per step).
    pub kill: Mutex<Option<tokio::sync::watch::Sender<bool>>>,
    pub log: Mutex<Vec<String>>,
}

pub struct BuildEngine {
    counter: AtomicU64,
    runs: Mutex<HashMap<u64, Arc<BuildRun>>>,
    order: Mutex<Vec<u64>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BuildLineEvent {
    pub build_id: u64,
    pub stream: String,
    pub text: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BuildFinishedEvent {
    pub build_id: u64,
    pub status: String, // "success" | "error" | "cancelled"
    pub issues: Vec<LogIssue>,
    pub pdf_path: Option<String>,
    pub duration_ms: u64,
    pub message: Option<String>,
}

const STEP_TIMEOUT_SECS: u64 = 600;
const MAX_RERUNS: usize = 3;
const MAX_KEPT_RUNS: usize = 10;

impl BuildEngine {
    pub fn new() -> Self {
        Self {
            counter: AtomicU64::new(0),
            runs: Mutex::new(HashMap::new()),
            order: Mutex::new(Vec::new()),
        }
    }

    pub fn start(&self, app: AppHandle, params: BuildParams) -> u64 {
        let id = self.counter.fetch_add(1, Ordering::SeqCst) + 1;
        let run = Arc::new(BuildRun {
            id,
            cancelled: Arc::new(AtomicBool::new(false)),
            kill: Mutex::new(None),
            log: Mutex::new(Vec::new()),
        });
        {
            let mut runs = self.runs.lock().unwrap();
            let mut order = self.order.lock().unwrap();
            runs.insert(id, run.clone());
            order.push(id);
            while order.len() > MAX_KEPT_RUNS {
                let old = order.remove(0);
                runs.remove(&old);
            }
        }
        tauri::async_runtime::spawn(async move {
            run_build(app, run, params).await;
        });
        id
    }

    pub fn cancel(&self, id: u64) -> AppResult<()> {
        let run = self.runs.lock().unwrap().get(&id).cloned();
        match run {
            Some(run) => {
                run.cancelled.store(true, Ordering::SeqCst);
                if let Some(sender) = run.kill.lock().unwrap().as_ref() {
                    let _ = sender.send(true);
                }
                Ok(())
            }
            None => Err(AppError::msg(format!(
                "La compilazione {id} non è in esecuzione."
            ))),
        }
    }

    pub fn log_text(&self, id: u64) -> Option<String> {
        let run = self.runs.lock().unwrap().get(&id).cloned();
        run.map(|r| r.log.lock().unwrap().join("\n"))
    }
}

impl Default for BuildEngine {
    fn default() -> Self {
        Self::new()
    }
}

fn emit_line(app: &AppHandle, run: &Arc<BuildRun>, stream: &str, text: &str) {
    let _ = app.emit(
        "build://output",
        BuildLineEvent {
            build_id: run.id,
            stream: stream.to_string(),
            text: text.to_string(),
        },
    );
    run.log.lock().unwrap().push(text.to_string());
}

fn emit_finished(
    app: &AppHandle,
    run: &Arc<BuildRun>,
    status: &str,
    issues: Vec<LogIssue>,
    pdf_path: Option<String>,
    duration_ms: u64,
    message: Option<String>,
) {
    let _ = app.emit(
        "build://finished",
        BuildFinishedEvent {
            build_id: run.id,
            status: status.to_string(),
            issues,
            pdf_path,
            duration_ms,
            message,
        },
    );
}

async fn run_build(app: AppHandle, run: Arc<BuildRun>, p: BuildParams) {
    let started = std::time::Instant::now();
    let out_dir = p.project_root.join(&p.output_dir_rel);
    if let Err(e) = std::fs::create_dir_all(&out_dir) {
        emit_finished(
            &app,
            &run,
            "error",
            Vec::new(),
            None,
            0,
            Some(format!("Impossibile creare la cartella di output: {e}")),
        );
        return;
    }
    emit_line(
        &app,
        &run,
        "stdout",
        &format!("=== Compilazione avviata: {} (motore: {}) ===", p.main_file, p.engine),
    );

    let result = execute(&app, &run, &p, &out_dir).await;
    *run.kill.lock().unwrap() = None;

    let duration_ms = started.elapsed().as_millis() as u64;
    match result {
        Err(msg) => emit_finished(&app, &run, "error", Vec::new(), None, duration_ms, Some(msg)),
        Ok(()) if run.cancelled.load(Ordering::SeqCst) => emit_finished(
            &app,
            &run,
            "cancelled",
            Vec::new(),
            None,
            duration_ms,
            Some("Compilazione annullata dall'utente.".into()),
        ),
        Ok(()) => {
            let log_path = out_dir.join(format!("{}.log", p.main_base));
            let issues = log_parser::parse_file(&log_path);
            let pdf_path = out_dir.join(format!("{}.pdf", p.main_base));
            if pdf_path.is_file() {
                emit_finished(
                    &app,
                    &run,
                    "success",
                    issues,
                    Some(pdf_path.to_string_lossy().into_owned()),
                    duration_ms,
                    None,
                )
            } else {
                emit_finished(
                    &app,
                    &run,
                    "error",
                    issues,
                    None,
                    duration_ms,
                    Some("Nessun file PDF prodotto.".into()),
                )
            }
        }
    }
}

async fn execute(
    app: &AppHandle,
    run: &Arc<BuildRun>,
    p: &BuildParams,
    out_dir: &Path,
) -> Result<(), String> {
    if run.cancelled.load(Ordering::SeqCst) {
        return Ok(());
    }

    // Preferred path: latexmk handles all passes, bibliography and reruns.
    if p.use_latexmk {
        if let Some(latexmk) = p.latexmk_path.clone() {
            let engine_flag = match p.engine.as_str() {
                "xelatex" => "-xelatex",
                "lualatex" => "-lualatex",
                _ => "-pdf",
            };
            let mut args: Vec<String> = vec![
                engine_flag.to_string(),
                "-interaction=nonstopmode".into(),
                "-file-line-error".into(),
                "-f".into(),
                format!("-outdir={}", p.output_dir_rel),
            ];
            if p.shell_escape {
                args.push("-shell-escape".into());
            }
            args.push(p.main_file.clone());
            return run_step(app, run, &latexmk, &args, &p.project_root, p.path_override.as_deref())
                .await;
        }
        emit_line(
            app,
            run,
            "stdout",
            "[latex-editor] latexmk non trovato: uso la pipeline a passate.",
        );
    }

    // Manual pipeline.
    let engine = p.engine_path.clone();
    let mut args: Vec<String> = vec![
        "-interaction=nonstopmode".into(),
        "-file-line-error".into(),
        format!("-output-directory={}", p.output_dir_rel),
    ];
    if p.shell_escape {
        args.push("-shell-escape".into());
    }
    args.push(p.main_file.clone());

    // pass 1
    run_step(app, run, &engine, &args, &p.project_root, p.path_override.as_deref()).await?;
    if run.cancelled.load(Ordering::SeqCst) {
        return Ok(());
    }

    // bibliography step
    let base = p.main_base.clone();
    let bcf = out_dir.join(format!("{base}.bcf"));
    let aux = out_dir.join(format!("{base}.aux"));
    if bcf.is_file() {
        if let Some(biber) = latex::find_binary("biber", p.path_override.as_deref()) {
            let bib_args = vec![base.clone()];
            let _ = run_step(app, run, &biber, &bib_args, out_dir, p.path_override.as_deref()).await;
        } else {
            emit_line(app, run, "stdout", "[latex-editor] biber non trovato: passo della bibliografia saltato.");
        }
    } else if aux.is_file() {
        let aux_text = std::fs::read(&aux)
            .map(|b| String::from_utf8_lossy(&b).into_owned())
            .unwrap_or_default();
        if aux_text.contains("\\bibdata") {
            if let Some(bibtex) = latex::find_binary("bibtex", p.path_override.as_deref()) {
                let bib_args = vec!["-terse".to_string(), base.clone()];
                let _ = run_step(app, run, &bibtex, &bib_args, out_dir, p.path_override.as_deref()).await;
            } else {
                emit_line(app, run, "stdout", "[latex-editor] bibtex non trovato: passo della bibliografia saltato.");
            }
        }
    }
    if run.cancelled.load(Ordering::SeqCst) {
        return Ok(());
    }

    // pass 2
    run_step(app, run, &engine, &args, &p.project_root, p.path_override.as_deref()).await?;

    // extra passes when the log explicitly asks for a rerun
    let log_path = out_dir.join(format!("{base}.log"));
    for _ in 0..MAX_RERUNS {
        if run.cancelled.load(Ordering::SeqCst) {
            return Ok(());
        }
        let log_text = std::fs::read(&log_path)
            .map(|b| String::from_utf8_lossy(&b).into_owned())
            .unwrap_or_default();
        let needs_rerun = log_text.contains("Rerun to get")
            || log_text.contains("Label(s) may have changed")
            || log_text.contains("Please rerun LaTeX");
        if !needs_rerun {
            break;
        }
        run_step(app, run, &engine, &args, &p.project_root, p.path_override.as_deref()).await?;
    }

    Ok(())
}

/// Run one subprocess: stream stdout/stderr as events, reap it, honour the
/// kill switch, and enforce a per-step timeout.
async fn run_step(
    app: &AppHandle,
    run: &Arc<BuildRun>,
    program: &Path,
    args: &[String],
    cwd: &Path,
    path_override: Option<&str>,
) -> Result<(), String> {
    let mut cmdline = program.display().to_string();
    for a in args {
        cmdline.push(' ');
        cmdline.push_str(a);
    }
    emit_line(app, run, "stdout", &format!("$ {cmdline}"));

    let mut cmd = Command::new(program);
    cmd.args(args)
        .current_dir(cwd)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    if let Some(dir) = path_override {
        let dir = dir.trim();
        if !dir.is_empty() {
            if let Some(current) = std::env::var_os("PATH") {
                let sep = if cfg!(windows) { ";" } else { ":" };
                cmd.env("PATH", format!("{dir}{sep}{}", current.to_string_lossy()));
            } else {
                cmd.env("PATH", dir.to_string());
            }
        }
    }
    #[cfg(windows)]
    {
        // CREATE_NO_WINDOW: no console flash while compiling.
        cmd.creation_flags(0x0800_0000);
    }

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => return Err(format!("Impossibile avviare {}: {e}", program.display())),
    };
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let (tx, mut rx) = mpsc::unbounded_channel::<(String, String)>();
    if let Some(out) = stdout {
        let tx2 = tx.clone();
        tauri::async_runtime::spawn(async move {
            stream_lines(out, "stdout", tx2).await;
        });
    }
    if let Some(err) = stderr {
        let tx3 = tx.clone();
        tauri::async_runtime::spawn(async move {
            stream_lines(err, "stderr", tx3).await;
        });
    }
    drop(tx);

    // Kill switch for this step.
    let (kill_tx, mut kill_rx) = tokio::sync::watch::channel(false);
    *run.kill.lock().unwrap() = Some(kill_tx.clone());

    let child_task = tauri::async_runtime::spawn(async move {
        tokio::select! {
            status = child.wait() => status,
            _ = kill_rx.changed() => {
                let _ = child.start_kill();
                child.wait().await
            }
        }
    });

    let work = async {
        // Stream lines until both readers hit EOF (usually when the child exits).
        while let Some((stream, text)) = rx.recv().await {
            emit_line(app, run, &stream, &text);
        }
        match child_task.await {
            Ok(Ok(_status)) => Ok::<(), String>(()),
            Ok(Err(e)) => Err(format!("Errore di processo: {e}")),
            Err(e) => Err(format!("Errore interno del task di compilazione: {e}")),
        }
    };

    let outcome = tokio::time::timeout(Duration::from_secs(STEP_TIMEOUT_SECS), work).await;
    *run.kill.lock().unwrap() = None;

    match outcome {
        // A non-zero exit code is not fatal here: real diagnostics come from
        // the log parser and from the presence of the PDF.
        Ok(Ok(())) => Ok(()),
        Ok(Err(msg)) => Err(msg),
        Err(_) => {
            let _ = kill_tx.send(true);
            Err(format!(
                "Passo di compilazione interrotto: timeout di {STEP_TIMEOUT_SECS} secondi."
            ))
        }
    }
}

async fn stream_lines<R: tokio::io::AsyncRead + Unpin>(
    reader: R,
    stream: &'static str,
    tx: mpsc::UnboundedSender<(String, String)>,
) {
    let mut lines = BufReader::new(reader).lines();
    loop {
        match lines.next_line().await {
            Ok(Some(line)) => {
                let _ = tx.send((stream.to_string(), line));
            }
            _ => break,
        }
    }
}

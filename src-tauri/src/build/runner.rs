//! Esecuzione della pipeline di build LaTeX come processo figlio.
//!
//! - Se `latexmk` è disponibile e richiesto, viene usato come comando unico.
//! - Altrimenti fallback manuale: motore → biber/bibtex → motore → (motore).
//! - L'output viene trasmesso al frontend riga per riga tramite eventi Tauri.
//! - La pipeline è annullabile: `cancel_build` imposta un flag e uccide il figlio.
//!
//! Tutto gira su thread standard (nessun runtime asincrono): più semplice,
//! meno dipendenze, stesso risultato.

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::build::log_parser::{self, Issue};
use crate::latex::{detect, engines};
use crate::state::BuildState;

/// Richiesta di build proveniente dal frontend.
#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BuildRequest {
    /// File principale, relativo alla radice progetto (es. "main.tex").
    pub main_file: String,
    /// "pdflatex" | "xelatex" | "lualatex".
    pub engine: String,
    pub use_latexmk: bool,
    /// Directory di output relativa (es. ".latex-editor/build").
    pub output_dir: String,
    /// Aggiunge `-shell-escape`: disattivato di default.
    pub allow_shell_escape: bool,
    /// Cartella/binari LaTeX configurata nelle impostazioni globali.
    pub latex_bin_dir: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OutputLineEvent {
    pub build_id: u64,
    pub stream: String,
    pub text: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StatusEvent {
    pub build_id: u64,
    /// "started" | "step" | "finished" | "cancelled".
    pub kind: String,
    pub step: Option<String>,
    pub success: Option<bool>,
    pub issues: Option<Vec<Issue>>,
    pub pdf_path: Option<String>,
    pub pdf_rel: Option<String>,
    pub duration_ms: Option<u64>,
    pub error: Option<String>,
}

fn status(bid: u64, kind: &str) -> StatusEvent {
    StatusEvent {
        build_id: bid,
        kind: kind.to_string(),
        step: None,
        success: None,
        issues: None,
        pdf_path: None,
        pdf_rel: None,
        duration_ms: None,
        error: None,
    }
}

fn emit_status(app: &AppHandle, ev: &StatusEvent) {
    let _ = app.emit("build:status", ev.clone());
}

fn emit_step(app: &AppHandle, bid: u64, label: &str) {
    let mut ev = status(bid, "step");
    ev.step = Some(label.to_string());
    emit_status(app, &ev);
}

#[cfg(windows)]
fn no_window(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn no_window(_cmd: &mut Command) {}

/// Legge una pipe del processo riga per riga ed emette `build:output`.
fn pump(
    app: AppHandle,
    bid: u64,
    stream: &str,
    reader: Box<dyn BufRead + Send>,
    sink: Arc<Mutex<Vec<String>>>,
) -> std::thread::JoinHandle<()> {
    let stream = stream.to_string();
    std::thread::spawn(move || {
        let mut reader = reader;
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    let text = line.trim_end_matches(['\r', '\n']).to_string();
                    let _ = app.emit(
                        "build:output",
                        OutputLineEvent {
                            build_id: bid,
                            stream: stream.clone(),
                            text: text.clone(),
                        },
                    );
                    if let Ok(mut g) = sink.lock() {
                        if g.len() < 20_000 {
                            g.push(text);
                        }
                    }
                }
            }
        }
    })
}

/// Esegue un passo della pipeline. Ritorna:
/// `Ok(Some(code))` con codice di uscita, `Ok(None)` se il processo è stato
/// terminato da un segnale, `Err("cancelled")` se annullato, `Err(msg)` per errori I/O.
#[allow(clippy::too_many_arguments)]
fn run_step(
    app: &AppHandle,
    bid: u64,
    label: &str,
    mut cmd: Command,
    cancel: &Arc<AtomicBool>,
    child_slot: &Arc<Mutex<Option<Child>>>,
    sink: &Arc<Mutex<Vec<String>>>,
) -> Result<Option<i32>, String> {
    emit_step(app, bid, label);
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    no_window(&mut cmd);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("impossibile avviare {label}: {e}"))?;
    let out = child.stdout.take();
    let err = child.stderr.take();

    let mut handles = Vec::new();
    if let Some(o) = out {
        handles.push(pump(app.clone(), bid, "stdout", Box::new(BufReader::new(o)), sink.clone()));
    }
    if let Some(e) = err {
        handles.push(pump(app.clone(), bid, "stderr", Box::new(BufReader::new(e)), sink.clone()));
    }

    {
        let mut g = child_slot.lock().unwrap();
        *g = Some(child);
    }

    let exit_code: Option<i32> = loop {
        let mut g = child_slot.lock().unwrap();
        if cancel.load(Ordering::SeqCst) {
            if let Some(c) = g.as_mut() {
                let _ = c.kill();
            }
        }
        match g.as_mut().map(|c| c.try_wait()) {
            Some(Ok(Some(st))) => {
                let code = st.code();
                g.take();
                break code;
            }
            Some(Err(_)) => {
                g.take();
                break None;
            }
            _ => {}
        }
        drop(g);
        std::thread::sleep(Duration::from_millis(40));
    };

    for h in handles {
        let _ = h.join();
    }
    {
        let mut g = child_slot.lock().unwrap();
        *g = None;
    }

    if cancel.load(Ordering::SeqCst) {
        return Err("cancelled".to_string());
    }
    Ok(exit_code)
}

fn read_text(path: &std::path::Path) -> String {
    std::fs::read_to_string(path).unwrap_or_default()
}

/// Pipeline completa. Viene eseguita in un thread dedicato.
pub fn run_build(app: AppHandle, root: PathBuf, req: BuildRequest, build_id: u64, bs: Arc<BuildState>) {
    let started = Instant::now();
    let root_str = root.display().to_string();

    {
        let mut ev = status(build_id, "started");
        ev.step = Some(req.engine.clone());
        emit_status(&app, &ev);
    }

    let cancel = bs.cancel.clone();
    let child_slot = bs.child.clone();
    let sink: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));

    let out_rel = req.output_dir.replace('\\', "/");
    let out_abs = root.join(&out_rel);
    let stem = engines::jobname(&req.main_file);
    let pdf_abs = out_abs.join(format!("{stem}.pdf"));
    let log_abs = out_abs.join(format!("{stem}.log"));

    let bin = req.latex_bin_dir.as_deref();

    let mut cancelled = false;
    let mut failure: Option<String> = None;
    let mut last_ok = false;
    let mut bib_ran = false;

    let latexmk_exe = if req.use_latexmk {
        detect::find_tool("latexmk", bin)
    } else {
        None
    };

    if let Some(exe) = latexmk_exe {
        let mut cmd = Command::new(&exe);
        cmd.current_dir(&root).args(engines::latexmk_args(
            &req.main_file,
            &out_rel,
            &req.engine,
            req.allow_shell_escape,
        ));
        match run_step(&app, build_id, "latexmk", cmd, &cancel, &child_slot, &sink) {
            Err(e) if e == "cancelled" => cancelled = true,
            Err(e) => failure = Some(e),
            Ok(code) => last_ok = code == Some(0),
        }
    } else {
        if req.use_latexmk {
            emit_step(&app, build_id, "latexmk non disponibile: pipeline manuale");
        }
        let engine_exe = detect::find_tool(&req.engine, bin);
        if engine_exe.is_none() {
            failure = Some(format!(
                "motore LaTeX \"{}\" non trovato: installa TeX Live, MiKTeX o TinyTeX oppure imposta la cartella bin nelle impostazioni",
                req.engine
            ));
        }
        if let Some(engine_exe) = engine_exe {
            // Passata 1
            let mut cmd = Command::new(&engine_exe);
            cmd.current_dir(&root).args(engines::engine_args(
                &req.main_file,
                &out_rel,
                req.allow_shell_escape,
            ));
            match run_step(&app, build_id, &format!("{} · passata 1", req.engine), cmd, &cancel, &child_slot, &sink) {
                Err(e) if e == "cancelled" => cancelled = true,
                Err(e) => failure = Some(e),
                Ok(code) => last_ok = code == Some(0),
            }

            // Bibliografia
            if !cancelled && failure.is_none() && last_ok {
                let bcf = out_abs.join(format!("{stem}.bcf"));
                let aux = read_text(&out_abs.join(format!("{stem}.aux")));
                if bcf.is_file() {
                    if let Some(biber) = detect::find_tool("biber", bin) {
                        let mut cmd = Command::new(&biber);
                        cmd.current_dir(&root)
                            .arg(format!("--input-directory={out_rel}"))
                            .arg(format!("--output-directory={out_rel}"))
                            .arg(&stem);
                        no_window(&mut cmd);
                        match run_step(&app, build_id, "biber", cmd, &cancel, &child_slot, &sink) {
                            Err(e) if e == "cancelled" => cancelled = true,
                            Err(e) => failure = Some(e),
                            Ok(_) => bib_ran = true,
                        }
                    } else {
                        let _ = app.emit(
                            "build:output",
                            OutputLineEvent {
                                build_id,
                                stream: "stdout".into(),
                                text: "avviso: biber non trovato, la bibliografia potrebbe essere assente".into(),
                            },
                        );
                    }
                } else if engines::wants_bibtex(&aux) {
                    if let Some(bibtex) = detect::find_tool("bibtex", bin) {
                        let mut cmd = Command::new(&bibtex);
                        // bibtex gira nella directory di output; BIBINPUTS/BSTINPUTS
                        // puntano alla radice progetto per trovare i .bib/.bst.
                        cmd.current_dir(&out_abs)
                            .arg(&stem)
                            .env("BIBINPUTS", &root)
                            .env("BSTINPUTS", &root);
                        no_window(&mut cmd);
                        match run_step(&app, build_id, "bibtex", cmd, &cancel, &child_slot, &sink) {
                            Err(e) if e == "cancelled" => cancelled = true,
                            Err(e) => failure = Some(e),
                            Ok(_) => bib_ran = true,
                        }
                    } else {
                        let _ = app.emit(
                            "build:output",
                            OutputLineEvent {
                                build_id,
                                stream: "stdout".into(),
                                text: "avviso: bibtex non trovato, la bibliografia potrebbe essere assente".into(),
                            },
                        );
                    }
                }
            }

            // Passata 2
            if !cancelled && failure.is_none() && last_ok {
                let mut cmd = Command::new(&engine_exe);
                cmd.current_dir(&root).args(engines::engine_args(
                    &req.main_file,
                    &out_rel,
                    req.allow_shell_escape,
                ));
                match run_step(&app, build_id, &format!("{} · passata 2", req.engine), cmd, &cancel, &child_slot, &sink) {
                    Err(e) if e == "cancelled" => cancelled = true,
                    Err(e) => failure = Some(e),
                    Ok(code) => last_ok = code == Some(0),
                }
            }

            // Passata 3 se serve (riferimenti o bibliografia)
            if !cancelled && failure.is_none() && last_ok && (bib_ran || engines::needs_rerun(&read_text(&log_abs))) {
                let mut cmd = Command::new(&engine_exe);
                cmd.current_dir(&root).args(engines::engine_args(
                    &req.main_file,
                    &out_rel,
                    req.allow_shell_escape,
                ));
                match run_step(&app, build_id, &format!("{} · passata 3", req.engine), cmd, &cancel, &child_slot, &sink) {
                    Err(e) if e == "cancelled" => cancelled = true,
                    Err(e) => failure = Some(e),
                    Ok(code) => last_ok = code == Some(0),
                }
            }
        }
    }

    // Parsing degli issue: preferisce il file .log, altrimenti lo stream raccolto.
    let log_text = read_text(&log_abs);
    let issues: Vec<Issue> = if !log_text.is_empty() {
        log_parser::parse_log(&log_text, Some(&root_str))
    } else {
        let stream_text = sink.lock().map(|g| g.join("\n")).unwrap_or_default();
        log_parser::parse_log(&stream_text, Some(&root_str))
    };
    let has_errors = issues.iter().any(|i| i.severity == "error");

    if cancelled {
        let mut ev = status(build_id, "cancelled");
        ev.duration_ms = Some(started.elapsed().as_millis() as u64);
        emit_status(&app, &ev);
    } else {
        let success = failure.is_none() && last_ok && pdf_abs.is_file() && !has_errors;
        let mut ev = status(build_id, "finished");
        ev.success = Some(success);
        ev.issues = Some(issues);
        ev.duration_ms = Some(started.elapsed().as_millis() as u64);
        ev.error = failure.clone();
        if success {
            ev.pdf_path = Some(pdf_abs.display().to_string());
            ev.pdf_rel = Some(format!("{out_rel}/{stem}.pdf"));
            bs.set_last_pdf(Some(pdf_abs));
        }
        emit_status(&app, &ev);
    }

    bs.finish();
}

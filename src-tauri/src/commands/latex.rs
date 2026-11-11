use once_cell::sync::Lazy;
use regex::Regex;
use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use crate::build_slot::{poll_action, OwnChild, PollAction};
use crate::error::{AppError, AppResult};
use crate::state::{AppState, BuildJob};
use crate::toolchain::{
    bib_need, build_phases, candidate_dirs, choose_build_driver, current_target_os, resolve_tool,
    BibNeed, BuildDriver, Step, TargetOs, ToolDetection, ToolPaths,
};
use tauri::{AppHandle, Emitter, Manager};

const LOG_CAP: usize = 5000;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ToolInfo {
    pub name: String,
    pub available: bool,
    pub version: String,
    /// Dove la detection ha trovato il tool OLTRE il PATH di processo:
    /// None = il PATH basta (available) oppure il tool non c'è. La barra di
    /// stato può mostrarlo per diagnosticare subito un PATH obsoleto.
    pub resolved_path: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LatexStatus {
    pub tools: Vec<ToolInfo>,
    pub latexmk_available: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LogLine {
    pub ts_ms: u64,
    pub kind: String, // "info" | "error" | "warning" | "stdout" | "stderr"
    pub file: Option<String>,
    pub line: Option<u32>,
    pub text: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BuildStartInfo {
    pub started: bool,
    pub latexmk_used: bool,
    pub message: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BuildFinished {
    pub success: bool,
    pub cancelled: bool,
    pub duration_ms: u64,
    pub pdf_path: Option<String>,
}

static FILE_LINE_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"^(?:"?)([^":\r\n]+\.tex)"?:(\d+):\s*(.*)$"#).unwrap());
static WARN_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^(LaTeX|Package|Class|pdfTeX|XeTeX|LuaTeX|LaTeX Font) Warning").unwrap()
});

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn hide_window(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    {
        let _ = cmd;
    }
}

/// Prima riga di `program --version` quando lo spawn riesce: è la versione
/// mostrata in barra di stato.
fn spawn_version(program: &str) -> Option<String> {
    let mut cmd = Command::new(program);
    cmd.arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    hide_window(&mut cmd);
    match cmd.output() {
        Ok(out) if out.status.success() => {
            let text = String::from_utf8_lossy(&out.stdout);
            Some(text.lines().next().unwrap_or("").trim().to_string())
        }
        _ => None,
    }
}

/// Il probe di un tool: prima il PATH di processo; quando il PATH non lo
/// raggiunge, le directory standard delle distribuzioni. Il percorso trovato
/// torna in `resolved_path` — la barra di stato può indicare DOVE il tool è
/// stato trovato, e gli spawn della build lo usano al posto del nome nudo.
fn probe_with(tool: &str, dirs: &[PathBuf]) -> ToolInfo {
    if let Some(version) = spawn_version(tool) {
        return ToolInfo {
            name: tool.into(),
            available: true,
            version,
            resolved_path: None,
        };
    }
    if let Some(path) = resolve_tool(tool, dirs) {
        let resolved = path.to_string_lossy().into_owned();
        if let Some(version) = spawn_version(&resolved) {
            return ToolInfo {
                name: tool.into(),
                available: true,
                version,
                resolved_path: Some(resolved),
            };
        }
    }
    ToolInfo {
        name: tool.into(),
        available: false,
        version: String::new(),
        resolved_path: None,
    }
}

/// Le directory dove cercare un tool quando il PATH di processo non lo
/// raggiunge: le radici arrivano dall'ambiente (su Windows TeX Live sta
/// sotto C:\texlive), l'ORDINE è quello deciso da `candidate_dirs`.
fn search_dirs() -> Vec<PathBuf> {
    match current_target_os() {
        TargetOs::Windows => {
            let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
            let roaming = std::env::var_os("APPDATA").map(PathBuf::from);
            candidate_dirs(
                TargetOs::Windows,
                local.as_deref(),
                roaming.as_deref(),
                Some(Path::new(r"C:\texlive")),
            )
        }
        os => candidate_dirs(os, None, None, None),
    }
}

fn probe(tool: &str) -> ToolInfo {
    probe_with(tool, &search_dirs())
}

// Rilevazione MINIMALE per il gate di start_build (M0.7.1): si sondano con
// `probe` solo latexmk e il motore richiesto; gli altri motori SOLO se
// entrambi mancano, per distinguere «nessuna distribuzione» da
// «distribuzione presente ma motore richiesto mancante». Mai bibtex/biber,
// mai uno spawn usato come rilevazione: la mappa completa dei sei tool è
// compito di detect_latex, per la UI.
//
// La stessa rilevazione riempie i percorsi risolti (risoluzione oltre il
// PATH): la coppia (detection, paths) decide la build E guida i suoi spawn
// con lo stesso dato, così un tool trovato oltre il PATH viene anche
// eseguito dal suo percorso.
fn detect_for_build(requested: &str) -> (ToolDetection, ToolPaths) {
    detect_for_build_with(requested, &search_dirs())
}

fn detect_for_build_with(requested: &str, dirs: &[PathBuf]) -> (ToolDetection, ToolPaths) {
    let latexmk = probe_with("latexmk", dirs);
    let engine = probe_with(requested, dirs);
    let mut paths = ToolPaths::default();
    paths.set_resolved("latexmk", latexmk.resolved_path.clone());
    paths.set_resolved(requested, engine.resolved_path.clone());
    let mut d = ToolDetection::default()
        .with_engine("latexmk", latexmk.available)
        .with_engine(requested, engine.available);
    if !d.latexmk && !d.any_engine() {
        for e in ["pdflatex", "xelatex", "lualatex"] {
            if e != requested {
                let info = probe_with(e, dirs);
                paths.set_resolved(e, info.resolved_path.clone());
                d = d.with_engine(e, info.available);
            }
        }
    }
    (d, paths)
}

/// Probe di un tool per un passo di build: disponibile e il programma da
/// eseguire — il percorso risolto quando la detection l'ha trovato oltre il
/// PATH, altrimenti il nome.
fn probe_program(name: &str) -> (bool, String) {
    let info = probe(name);
    (
        info.available,
        info.resolved_path
            .clone()
            .unwrap_or_else(|| name.to_string()),
    )
}

#[tauri::command]
pub async fn detect_latex() -> LatexStatus {
    tauri::async_runtime::spawn_blocking(|| {
        let names = [
            "pdflatex", "xelatex", "lualatex", "latexmk", "bibtex", "biber",
        ];
        let tools: Vec<ToolInfo> = names.iter().map(|n| probe(n)).collect();
        let latexmk_available = tools
            .iter()
            .find(|t| t.name == "latexmk")
            .map(|t| t.available)
            .unwrap_or(false);
        LatexStatus {
            tools,
            latexmk_available,
        }
    })
    .await
    .unwrap_or(LatexStatus {
        tools: Vec::new(),
        latexmk_available: false,
    })
}

fn classify(raw: &str) -> LogLine {
    let ts = now_ms();
    if let Some(c) = FILE_LINE_RE.captures(raw) {
        return LogLine {
            ts_ms: ts,
            kind: "error".into(),
            file: Some(c[1].trim().to_string()),
            line: c[2].parse().ok(),
            text: raw.to_string(),
        };
    }
    let kind = if raw.starts_with('!') {
        "error"
    } else if WARN_RE.is_match(raw) {
        "warning"
    } else {
        "info"
    };
    LogLine {
        ts_ms: ts,
        kind: kind.into(),
        file: None,
        line: None,
        text: raw.to_string(),
    }
}

fn read_stream<R: std::io::Read + Send + 'static>(
    r: R,
    stderr_channel: bool,
    app: AppHandle,
    lines: Arc<Mutex<Vec<LogLine>>>,
) {
    let reader = BufReader::new(r);
    for line in reader.lines() {
        let Ok(raw) = line else { break };
        let raw = raw
            .trim_end_matches('\r')
            .trim_end_matches('\n')
            .to_string();
        if raw.trim().is_empty() {
            continue;
        }
        let mut ll = classify(&raw);
        if stderr_channel && ll.kind == "info" {
            ll.kind = "stderr".into();
        }
        {
            let mut buf = lines.lock().unwrap_or_else(|p| p.into_inner());
            if buf.len() < LOG_CAP {
                buf.push(ll.clone());
            }
        }
        let _ = app.emit("build-output", &ll);
    }
}

fn push_line(app: &AppHandle, lines: &Arc<Mutex<Vec<LogLine>>>, text: &str, kind: &str) {
    let ll = LogLine {
        ts_ms: now_ms(),
        kind: kind.into(),
        file: None,
        line: None,
        text: text.to_string(),
    };
    {
        let mut buf = lines.lock().unwrap_or_else(|p| p.into_inner());
        if buf.len() < LOG_CAP {
            buf.push(ll.clone());
        }
    }
    let _ = app.emit("build-output", &ll);
}

fn tex_inputs_env(out_dir: &Path) -> AppResult<std::ffi::OsString> {
    let joined = std::env::join_paths([Path::new("."), out_dir])?;
    let sep = if cfg!(windows) { ";" } else { ":" };
    let mut v = joined.into_string().unwrap_or_default();
    v.push_str(sep); // trailing separator = append the system default search path
    Ok(std::ffi::OsString::from(v))
}

fn engine_args(main_file: &str, out_dir: &Path, shell_escape: bool) -> Vec<String> {
    vec![
        "-interaction=nonstopmode".into(),
        "-file-line-error".into(),
        if shell_escape {
            "-shell-escape".into()
        } else {
            "-no-shell-escape".into()
        },
        "-output-directory".into(),
        out_dir.to_string_lossy().into_owned(),
        main_file.to_string(),
    ]
}

fn latexmk_args(engine: &str, main_file: &str, out_dir: &Path, shell_escape: bool) -> Vec<String> {
    let mut a: Vec<String> = vec![];
    match engine {
        "xelatex" => a.push("-xelatex".into()),
        "lualatex" => a.push("-lualatex".into()),
        _ => a.push("-pdf".into()),
    }
    a.push("-interaction=nonstopmode".into());
    a.push("-file-line-error".into());
    a.push(
        if shell_escape {
            "-shell-escape"
        } else {
            "-no-shell-escape"
        }
        .into(),
    );
    a.push("-outdir".into());
    a.push(out_dir.to_string_lossy().into_owned());
    a.push(main_file.to_string());
    a
}

#[tauri::command]
pub async fn start_build(
    app: AppHandle,
    root: String,
    main_file: String,
    engine: String,
    shell_escape: bool,
) -> AppResult<BuildStartInfo> {
    if !matches!(engine.as_str(), "pdflatex" | "xelatex" | "lualatex") {
        return Err(AppError::Plain(format!("engine non supportato: {engine}")));
    }
    let root_path = PathBuf::from(&root);
    if !root_path.is_dir() {
        return Err(AppError::Plain("la cartella del progetto non esiste".into()));
    }
    let main_path = crate::commands::project::resolve_in_root(&root_path, &main_file)?;
    if !main_path.is_file() {
        return Err(AppError::Plain(format!(
            "file principale non trovato: {main_file} — se il tuo documento ha un altro nome, \
             correggilo in Impostazioni → File principale (o crea il file con «+ file»)"
        )));
    }

    // M0.7.1 — GATE: la compilazione non parte MAI alla cieca. Prima di
    // riservare lo slot (e prima di creare qualunque cartella) la decisione
    // su CHE COSA guiderà la build passa per la logica pura
    // `toolchain::choose_build_driver` applicata a una rilevazione minima.
    // Se la rilevazione dice che il toolchain non c'è, il comando ritorna
    // l'esito TIPIZZATO (AppError::Toolchain) senza tentare alcuno spawn:
    // l'errore `io` grezzo («program not found») non esiste più come esito
    // di start_build.
    let detection = tauri::async_runtime::spawn_blocking({
        let requested = engine.clone();
        move || detect_for_build(&requested)
    })
    .await
    .map_err(|e| AppError::Plain(format!("rilevazione strumenti non riuscita: {e}")))?;
    let (detection, paths) = detection;
    let driver = choose_build_driver(&detection, &engine)?;
    let jobname = main_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("main")
        .to_string();
    let out_dir = root_path.join(".latex-editor").join("build");
    std::fs::create_dir_all(&out_dir)?;

    let state = app.state::<AppState>();
    // Reserve the build slot SYNCHRONOUSLY, before spawning the monitor
    // thread: check-and-claim happen in one serialized step, so two
    // concurrent starts can never both pass (the old guard released the
    // lock before the thread spawned, leaving a double-start window).
    let job_id = state
        .slot
        .reserve()
        .map_err(|_| AppError::Plain("una compilazione è già in corso".into()))?;

    // La decisione del gate decide anche il driver del monitor: latexmk
    // guida la build quando è disponibile, altrimenti il motore richiesto
    // gira direttamente con la sequenza multi-passaggio propria.
    let (latexmk_used, decided_engine) = match &driver {
        BuildDriver::Latexmk { engine } => (true, engine.clone()),
        BuildDriver::Engine { engine } => (false, engine.clone()),
    };
    let lines: Arc<Mutex<Vec<LogLine>>> = Arc::new(Mutex::new(Vec::new()));
    let texinputs = tex_inputs_env(&out_dir)?;

    // Clones for the monitor thread.
    let app2 = app.clone();
    let lines2 = lines.clone();
    let root2 = root_path.clone();
    let out_dir2 = out_dir.clone();
    let jobname2 = jobname.clone();
    let engine2 = decided_engine;
    let paths2 = paths;
    let main_file2 = main_file.clone();
    let latexmk_mode = latexmk_used;

    thread::spawn(move || {
        let started = Instant::now();
        let mut cancelled = false;
        let mut ok = true;
        let mut registered = false;

        // Queue of steps. In latexmk mode there is a single step; otherwise the
        // bibliography step (if any) is inserted dynamically after pass 1.
        // I programmi arrivano dai percorsi risolti: un tool trovato oltre il
        // PATH parte dal suo percorso completo, non dal nome nudo.
        let mut phases: Vec<Step> = build_phases(
            latexmk_mode,
            &engine2,
            &paths2,
            latexmk_args(&engine2, &main_file2, &out_dir2, shell_escape),
        );

        let run_step = |program: &str,
                        args: &[String],
                        app: &AppHandle,
                        lines: &Arc<Mutex<Vec<LogLine>>>,
                        cancelled: &mut bool|
         -> bool {
            push_line(
                app,
                lines,
                &format!("=== {program} {} ===", args.join(" ")),
                "info",
            );
            let mut cmd = Command::new(program);
            cmd.args(args)
                .current_dir(&root2)
                .env("TEXINPUTS", &texinputs)
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            hide_window(&mut cmd);
            let mut child = match cmd.spawn() {
                Ok(c) => c,
                Err(e) => {
                    push_line(
                        app,
                        lines,
                        &format!("impossibile avviare {program}: {e}"),
                        "error",
                    );
                    return false;
                }
            };
            let stdout = child.stdout.take().unwrap();
            let stderr = child.stderr.take().unwrap();
            // The child stays a LOCAL variable of this monitor thread: it
            // is registered in the shared state for its LOG only. Nobody
            // but this thread can kill or reap the process — the old design
            // kept the child in the shared state and the cancellation paths
            // took and killed whatever sat there, whichever job owned it.
            {
                let st = app.state::<AppState>();
                let mut g = st.build.lock().unwrap_or_else(|p| p.into_inner());
                *g = Some(BuildJob {
                    id: job_id,
                    lines: lines.clone(),
                });
            }
            let h1 = {
                let a = app.clone();
                let l = lines.clone();
                thread::spawn(move || read_stream(stdout, false, a, l))
            };
            let h2 = {
                let a = app.clone();
                let l = lines.clone();
                thread::spawn(move || read_stream(stderr, true, a, l))
            };
            let mut step_success = false;
            loop {
                thread::sleep(std::time::Duration::from_millis(120));
                let st = app.state::<AppState>();
                // The decision is taken on THIS job's identity and on THIS
                // monitor's own child only: a cancelled job kills and reaps
                // its own child, never a child registered by a newer job.
                let own = match child.try_wait() {
                    Ok(Some(s)) => OwnChild::Exited { success: s.success() },
                    Ok(None) => OwnChild::Running,
                    Err(_) => OwnChild::Lost,
                };
                match poll_action(st.slot.is_active(job_id), own) {
                    PollAction::KeepWaiting => {}
                    PollAction::CancelOwn => {
                        let _ = child.kill();
                        let _ = child.wait();
                        *cancelled = true;
                        break;
                    }
                    PollAction::Finish { success } => {
                        step_success = success;
                        break;
                    }
                }
            }
            let _ = h1.join();
            let _ = h2.join();
            if *cancelled {
                return false;
            }
            if !step_success {
                push_line(
                    app,
                    lines,
                    &format!("{program} è terminato con un errore"),
                    "error",
                );
            }
            step_success
        };

        let mut pass = 0;
        while !phases.is_empty() {
            if registered {
                // Cancellation between steps is keyed on the job identity:
                // the child slot can legitimately hold the previous step's
                // exited child (or be empty between spawn and register).
                let st = app2.state::<AppState>();
                if !st.slot.is_active(job_id) {
                    cancelled = true;
                }
            }
            if cancelled {
                break;
            }
            let step = phases.remove(0);
            let step_ok = match step {
                Step::Bib(prog, args) => run_step(&prog, &args, &app2, &lines2, &mut cancelled),
                Step::Engine(prog) => {
                    let args = engine_args(&main_file2, &out_dir2, shell_escape);
                    run_step(&prog, &args, &app2, &lines2, &mut cancelled)
                }
            };
            registered = true;
            if cancelled {
                break;
            }
            if !step_ok {
                ok = false;
                break;
            }
            if latexmk_mode {
                // latexmk manages all passes on its own.
                break;
            }
            if pass == 0 {
                pass = 1;
                let aux = out_dir2.join(format!("{jobname2}.aux"));
                let aux_txt = std::fs::read_to_string(&aux).unwrap_or_default();
                let mut extra: Vec<Step> = Vec::new();
                match bib_need(&aux_txt, out_dir2.join(format!("{jobname2}.bcf")).exists()) {
                    Some(BibNeed::Bibtex) => {
                        let (available, program) = probe_program("bibtex");
                        if available {
                            push_line(&app2, &lines2, "rilevata bibliografia BibTeX", "info");
                            let aux_path =
                                out_dir2.join(&jobname2).to_string_lossy().into_owned();
                            extra.push(Step::Bib(program, vec![aux_path]));
                        }
                    }
                    Some(BibNeed::Biber) => {
                        let (available, program) = probe_program("biber");
                        if available {
                            push_line(
                                &app2,
                                &lines2,
                                "rilevata bibliografia biblatex/biber",
                                "info",
                            );
                            extra.push(Step::Bib(
                                program,
                                vec![
                                    "--input-directory".into(),
                                    out_dir2.to_string_lossy().into_owned(),
                                    jobname2.clone(),
                                ],
                            ));
                        }
                    }
                    None => {}
                }
                extra.push(Step::Engine(engine2.clone()));
                extra.push(Step::Engine(engine2.clone()));
                for e in extra.into_iter().rev() {
                    phases.insert(0, e);
                }
            }
        }

        // Persist the final log for later retrieval, then free the job
        // slot. The child handle is local to run_step and is already reaped
        // there; the identity slot is released ONLY if it still belongs to
        // this job, and the running-log registration is cleared ONLY if it
        // is still ours: a newer job that started right after the
        // cancellation has registered its own log — the old monitor must
        // not wipe it (and, with the child now local, can never kill it).
        {
            let st = app2.state::<AppState>();
            let mut last = st.last_log.lock().unwrap_or_else(|p| p.into_inner());
            let buf = lines2.lock().unwrap_or_else(|p| p.into_inner());
            *last = buf.clone();
            *st.last_success.lock().unwrap_or_else(|p| p.into_inner()) = Some(ok && !cancelled);
            let mut g = st.build.lock().unwrap_or_else(|p| p.into_inner());
            if g.as_ref().map(|j| j.id) == Some(job_id) {
                *g = None;
            }
            drop(g);
            st.slot.finish(job_id);
        }

        let pdf = out_dir2.join(format!("{jobname2}.pdf"));
        let payload = BuildFinished {
            success: ok && !cancelled,
            cancelled,
            duration_ms: started.elapsed().as_millis() as u64,
            pdf_path: if ok && !cancelled && pdf.is_file() {
                Some(pdf.to_string_lossy().into_owned())
            } else {
                None
            },
        };
        let _ = app2.emit("build-finished", &payload);
    });

    Ok(BuildStartInfo {
        started: true,
        latexmk_used,
        message: if latexmk_used {
            "compilazione avviata con latexmk".into()
        } else {
            "latexmk non disponibile: sequenza multi-passaggio (motore + bibliografia + 2 passi)"
                .into()
        },
    })
}

#[tauri::command]
pub async fn cancel_build(app: AppHandle) -> AppResult<bool> {
    let state = app.state::<AppState>();
    // Only the identity slot is cleared. The monitor of the cancelled job
    // notices at its next poll (<= 120 ms) and kills and reaps its OWN
    // child, a local variable of its thread. Nothing is ever taken or
    // killed through the shared state, where a newer job started right
    // after the cancellation may already have registered its own log.
    Ok(state.slot.cancel_active().is_some())
}

#[tauri::command]
pub async fn read_build_log(app: AppHandle) -> AppResult<Vec<LogLine>> {
    let state = app.state::<AppState>();
    let running_log = {
        let g = state.build.lock().unwrap_or_else(|p| p.into_inner());
        g.as_ref()
            .map(|job| job.lines.lock().unwrap_or_else(|p| p.into_inner()).clone())
    };
    Ok(running_log.unwrap_or_else(|| {
        let last = state.last_log.lock().unwrap_or_else(|p| p.into_inner());
        last.clone()
    }))
}

#[tauri::command]
pub async fn read_pdf_bytes(root: String, main_file: String) -> AppResult<tauri::ipc::Response> {
    tauri::async_runtime::spawn_blocking(move || {
        let root_path = PathBuf::from(&root);
        let main_path = crate::commands::project::resolve_in_root(&root_path, &main_file)?;
        let jobname = main_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("main")
            .to_string();
        let pdf = root_path
            .join(".latex-editor")
            .join("build")
            .join(format!("{jobname}.pdf"));
        let bytes = std::fs::read(&pdf).map_err(|_| {
            AppError::Plain(format!(
                "PDF non trovato: compila prima il progetto ({})",
                pdf.display()
            ))
        })?;
        Ok(tauri::ipc::Response::new(bytes))
    })
    .await
    .map_err(|e| AppError::Plain(format!("task failed: {e}")))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    // Directory temporanea unica per le fixture: pid + nanosecondi, così i
    // test in parallelo non si toccano.
    fn temp_root(tag: &str) -> PathBuf {
        let base = std::env::temp_dir().join(format!(
            "morsa-latex-{}-{}-{}",
            tag,
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .subsec_nanos()
        ));
        std::fs::create_dir_all(&base).unwrap();
        base
    }

    // Il DISCRIMINANTE del probe: un tool presente SOLO in una candidate
    // dir, con un nome che nessun sistema mette sul PATH — il probe sul
    // PATH fallisce esattamente come con un PATH di processo vuoto o
    // obsoleto, e la risoluzione lo recupera. È lo scenario del bug: l'app
    // installata segnala «Nessuna distribuzione LaTeX trovata» mentre
    // `pdflatex --version` funziona da cmd. Sulla detection PATH-only
    // attuale questo test è ROSSO (prova nell'allegato della consegna).
    #[cfg(unix)]
    #[test]
    fn probe_trova_un_tool_presente_solo_nelle_candidate_dirs() {
        let root = temp_root("probe");
        let bin = root.join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        let exe = bin.join("morsa-probe-fixture");
        std::fs::write(&exe, "#!/bin/sh\necho morsa-fixture 1.0\n").unwrap();
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&exe, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        let info = probe_with("morsa-probe-fixture", std::slice::from_ref(&bin));
        assert!(
            info.available,
            "il tool nelle candidate dirs deve risultare disponibile anche \
             quando il PATH di processo non lo contiene"
        );
        assert_eq!(
            info.resolved_path.as_deref(),
            Some(exe.to_str().unwrap()),
            "resolved_path deve indicare DOVE il tool è stato trovato"
        );
        assert!(
            info.version.contains("morsa-fixture"),
            "la versione deve venire dallo spawn del percorso risolto: {}",
            info.version
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    // Un tool assente dal PATH e da tutte le candidate dirs resta non
    // disponibile: la risoluzione non inventa disponibilità.
    #[test]
    fn probe_lascia_non_disponibile_un_tool_assente_ovunque() {
        let root = temp_root("assente");
        let info = probe_with("morsa-assente-ovunque", std::slice::from_ref(&root));
        assert!(!info.available);
        assert!(info.resolved_path.is_none());
        assert!(info.version.is_empty());
        let _ = std::fs::remove_dir_all(&root);
    }
}

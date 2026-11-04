use once_cell::sync::Lazy;
use regex::Regex;
use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use crate::error::{AppError, AppResult};
use crate::state::{AppState, BuildJob};
use tauri::{AppHandle, Emitter, Manager};

const LOG_CAP: usize = 5000;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ToolInfo {
    pub name: String,
    pub available: bool,
    pub version: String,
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

fn probe(tool: &str) -> ToolInfo {
    let mut cmd = Command::new(tool);
    cmd.arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    hide_window(&mut cmd);
    match cmd.output() {
        Ok(out) if out.status.success() => {
            let text = String::from_utf8_lossy(&out.stdout);
            let first = text.lines().next().unwrap_or("").trim().to_string();
            ToolInfo {
                name: tool.into(),
                available: true,
                version: first,
            }
        }
        _ => ToolInfo {
            name: tool.into(),
            available: false,
            version: String::new(),
        },
    }
}

#[tauri::command]
pub async fn detect_latex() -> LatexStatus {
    tauri::async_runtime::spawn_blocking(|| {
        let names = ["pdflatex", "xelatex", "lualatex", "latexmk", "bibtex", "biber"];
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
        let raw = raw.trim_end_matches('\r').trim_end_matches('\n').to_string();
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
    a.push(if shell_escape { "-shell-escape" } else { "-no-shell-escape" }.into());
    a.push("-outdir".into());
    a.push(out_dir.to_string_lossy().into_owned());
    a.push(main_file.to_string());
    a
}

enum Step {
    Engine(String),           // program name; args built at run time
    Bib(String, Vec<String>), // program + explicit args
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
        return Err(AppError(format!("engine non supportato: {engine}")));
    }
    let root_path = PathBuf::from(&root);
    if !root_path.is_dir() {
        return Err(AppError("la cartella del progetto non esiste".into()));
    }
    let main_path = crate::commands::project::resolve_in_root(&root_path, &main_file)?;
    if !main_path.is_file() {
        return Err(AppError(format!("file principale non trovato: {main_file}")));
    }
    let jobname = main_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("main")
        .to_string();
    let out_dir = root_path.join(".latex-editor").join("build");
    std::fs::create_dir_all(&out_dir)?;

    let state = app.state::<AppState>();
    {
        let guard = state.build.lock().unwrap_or_else(|p| p.into_inner());
        if guard.is_some() {
            return Err(AppError("una compilazione è già in corso".into()));
        }
    }
    drop(state);

    let latexmk_used = probe("latexmk").available;
    let lines: Arc<Mutex<Vec<LogLine>>> = Arc::new(Mutex::new(Vec::new()));
    let texinputs = tex_inputs_env(&out_dir)?;

    // Clones for the monitor thread.
    let app2 = app.clone();
    let lines2 = lines.clone();
    let root2 = root_path.clone();
    let out_dir2 = out_dir.clone();
    let jobname2 = jobname.clone();
    let engine2 = engine.clone();
    let main_file2 = main_file.clone();
    let latexmk_mode = latexmk_used;

    thread::spawn(move || {
        let started = Instant::now();
        let mut cancelled = false;
        let mut ok = true;
        let mut registered = false;

        // Queue of steps. In latexmk mode there is a single step; otherwise the
        // bibliography step (if any) is inserted dynamically after pass 1.
        let mut phases: Vec<Step> = if latexmk_mode {
            vec![Step::Bib(
                "latexmk".into(),
                latexmk_args(&engine2, &main_file2, &out_dir2, shell_escape),
            )]
        } else {
            vec![Step::Engine(engine2.clone())]
        };

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
                    push_line(app, lines, &format!("impossibile avviare {program}: {e}"), "error");
                    return false;
                }
            };
            let stdout = child.stdout.take().unwrap();
            let stderr = child.stderr.take().unwrap();
            {
                let st = app.state::<AppState>();
                let mut g = st.build.lock().unwrap_or_else(|p| p.into_inner());
                *g = Some(BuildJob {
                    child,
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
            let mut status: Option<std::process::ExitStatus> = None;
            loop {
                thread::sleep(std::time::Duration::from_millis(120));
                let st = app.state::<AppState>();
                let mut g = st.build.lock().unwrap_or_else(|p| p.into_inner());
                match g.as_mut() {
                    None => {
                        *cancelled = true;
                        break;
                    }
                    Some(job) => match job.child.try_wait() {
                        Ok(Some(s)) => {
                            status = Some(s);
                            break;
                        }
                        Ok(None) => {}
                        Err(_) => break,
                    },
                }
            }
            let _ = h1.join();
            let _ = h2.join();
            if *cancelled {
                return false;
            }
            let success = status.map(|s| s.success()).unwrap_or(false);
            if !success {
                push_line(app, lines, &format!("{program} è terminato con un errore"), "error");
            }
            success
        };

        let mut pass = 0;
        while !phases.is_empty() {
            if registered {
                // If the job slot is empty here, cancel_build ran between steps.
                let st = app2.state::<AppState>();
                let g = st.build.lock().unwrap_or_else(|p| p.into_inner());
                if g.is_none() {
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
                if aux_txt.contains("\\bibdata") && probe("bibtex").available {
                    push_line(&app2, &lines2, "rilevata bibliografia BibTeX", "info");
                    let aux_path = out_dir2.join(&jobname2).to_string_lossy().into_owned();
                    extra.push(Step::Bib("bibtex".into(), vec![aux_path]));
                } else if (aux_txt.contains("\\abx@aux")
                    || out_dir2.join(format!("{jobname2}.bcf")).exists())
                    && probe("biber").available
                {
                    push_line(&app2, &lines2, "rilevata bibliografia biblatex/biber", "info");
                    extra.push(Step::Bib(
                        "biber".into(),
                        vec![
                            "--input-directory".into(),
                            out_dir2.to_string_lossy().into_owned(),
                            jobname2.clone(),
                        ],
                    ));
                }
                extra.push(Step::Engine(engine2.clone()));
                extra.push(Step::Engine(engine2.clone()));
                for e in extra.into_iter().rev() {
                    phases.insert(0, e);
                }
            }
        }

        // Persist the final log for later retrieval, then free the job slot.
        {
            let st = app2.state::<AppState>();
            let mut last = st.last_log.lock().unwrap_or_else(|p| p.into_inner());
            let buf = lines2.lock().unwrap_or_else(|p| p.into_inner());
            *last = buf.clone();
            *st.last_success.lock().unwrap_or_else(|p| p.into_inner()) = Some(ok && !cancelled);
            let mut g = st.build.lock().unwrap_or_else(|p| p.into_inner());
            *g = None;
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
            "latexmk non disponibile: sequenza multi-passaggio (motore + bibliografia + 2 passi)".into()
        },
    })
}

#[tauri::command]
pub async fn cancel_build(app: AppHandle) -> AppResult<bool> {
    let state = app.state::<AppState>();
    let job = {
        let mut g = state.build.lock().unwrap_or_else(|p| p.into_inner());
        g.take()
    };
    if let Some(mut job) = job {
        let _ = job.child.kill();
        let _ = job.child.wait();
        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub async fn read_build_log(app: AppHandle) -> AppResult<Vec<LogLine>> {
    let state = app.state::<AppState>();
    let running_log = {
        let g = state.build.lock().unwrap_or_else(|p| p.into_inner());
        match g.as_ref() {
            Some(job) => Some(job.lines.lock().unwrap_or_else(|p| p.into_inner()).clone()),
            None => None,
        }
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
            AppError(format!(
                "PDF non trovato: compila prima il progetto ({})",
                pdf.display()
            ))
        })?;
        Ok(tauri::ipc::Response::new(bytes))
    })
    .await
    .map_err(|e| AppError(format!("task failed: {e}")))?
}

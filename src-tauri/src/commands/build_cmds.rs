//! Comandi di build e rilevamento LaTeX.

use std::sync::atomic::Ordering;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::build::runner::{self, BuildRequest, StatusEvent};
use crate::error::AppError;
use crate::fs::sandbox;
use crate::latex::{detect, engines};
use crate::state::AppState;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BuildStarted {
    pub build_id: u64,
}

#[tauri::command]
pub fn detect_latex(bin_dir: Option<String>) -> detect::LatexInfo {
    detect::detect_all(bin_dir.as_deref())
}

#[tauri::command]
pub fn start_build(
    req: BuildRequest,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<BuildStarted, AppError> {
    let root = state.root()?;

    if !engines::is_engine(&req.engine) {
        return Err(AppError::Invalid(format!("motore non supportato: {}", req.engine)));
    }
    if req.main_file.trim().is_empty() {
        return Err(AppError::Invalid("file principale non impostato".into()));
    }
    let main = sandbox::resolve_in_root(&root, &req.main_file)?;
    if !main.is_file() {
        return Err(AppError::NotFound(format!("file principale non trovato: {}", req.main_file)));
    }
    let out = sandbox::resolve_in_root(&root, &req.output_dir)?;
    std::fs::create_dir_all(&out)?;

    let bs = state.build.clone();
    if !bs.claim_start() {
        return Err(AppError::BuildRunning);
    }
    bs.cancel.store(false, Ordering::SeqCst);
    let build_id = bs.next_id();

    let app2 = app.clone();
    std::thread::spawn(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            runner::run_build(app2.clone(), root, req, build_id, bs.clone())
        }));
        if result.is_err() {
            // Rete di sicurezza: libera il flag di running ed emette un errore.
            let mut ev = StatusEvent {
                build_id,
                kind: "finished".into(),
                step: None,
                success: Some(false),
                issues: Some(Vec::new()),
                pdf_path: None,
                pdf_rel: None,
                duration_ms: None,
                error: Some("errore interno durante la build".into()),
            };
            ev.duration_ms = Some(0);
            let _ = app2.emit("build:status", ev);
            bs.finish();
        }
    });

    Ok(BuildStarted { build_id })
}

#[tauri::command]
pub fn cancel_build(state: State<'_, AppState>) -> Result<(), AppError> {
    let bs = state.build.clone();
    bs.cancel.store(true, Ordering::SeqCst);
    let mut guard = bs.child.lock().unwrap();
    if let Some(child) = guard.as_mut() {
        let _ = child.kill();
    }
    Ok(())
}

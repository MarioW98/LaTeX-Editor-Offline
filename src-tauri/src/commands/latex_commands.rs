//! LaTeX toolchain detection command.

use tauri::AppHandle;

use crate::latex::{self, LatexReport};
use crate::settings;

/// Detect the local LaTeX installation (engines, latexmk, bibtex, biber and
/// the distribution name). Honours the global `latexPathOverride` setting.
/// Note: this is pure detection — the editor never downloads anything.
#[tauri::command]
pub async fn detect_latex_installation(app: AppHandle) -> Result<LatexReport, crate::error::AppError> {
    let global = settings::load_global(&app);
    let override_dir = global.latex_path_override.as_deref();
    // Version probing spawns short-lived local processes; run them off the
    // main thread (this is an async command on the runtime).
    let report = latex::detect(override_dir);
    Ok(report)
}

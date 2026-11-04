//! Global (app data dir) and per-project settings commands.

use tauri::AppHandle;

use crate::error::AppResult;
use crate::sandbox;
use crate::settings::{self, GlobalSettings, ProjectSettings};

#[tauri::command]
pub fn get_global_settings(app: AppHandle) -> AppResult<GlobalSettings> {
    Ok(settings::load_global(&app))
}

#[tauri::command]
pub fn save_global_settings(app: AppHandle, settings: GlobalSettings) -> AppResult<()> {
    settings::save_global(&app, &settings)
}

#[tauri::command]
pub fn get_project_settings(project_root: String) -> AppResult<ProjectSettings> {
    let root = sandbox::validate_root(&project_root)?;
    Ok(settings::load_project(&root))
}

#[tauri::command]
pub fn save_project_settings(
    project_root: String,
    settings: ProjectSettings,
) -> AppResult<ProjectSettings> {
    let root = sandbox::validate_root(&project_root)?;
    // validate before persisting
    sandbox::sanitize_relative(&settings.main_file)?;
    sandbox::sanitize_relative(&settings.output_dir)?;
    if !["pdflatex", "xelatex", "lualatex"].contains(&settings.engine.as_str()) {
        return Err(crate::error::AppError::InvalidPath(format!(
            "Motore non riconosciuto: {}",
            settings.engine
        )));
    }
    settings::save_project(&root, &settings)?;
    Ok(settings)
}

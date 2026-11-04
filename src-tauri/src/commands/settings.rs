use serde_json::{json, Value};
use std::path::PathBuf;

use crate::error::AppResult;
use tauri::{AppHandle, Manager};

fn default_project_settings() -> Value {
    json!({
        "mainFile": "main.tex",
        "engine": "pdflatex",
        "shellEscape": false,
        "autoSave": true,
        "autoBuild": false,
        "fontSize": 13.5
    })
}

fn default_app_settings() -> Value {
    json!({
        "lastProject": null,
        "recentProjects": []
    })
}

fn read_json(path: &PathBuf, fallback: Value) -> Value {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(fallback)
}

#[tauri::command]
pub fn get_project_settings(root: String) -> Value {
    let p = PathBuf::from(&root)
        .join(".latex-editor")
        .join("settings.json");
    read_json(&p, default_project_settings())
}

#[tauri::command]
pub fn save_project_settings(root: String, settings: Value) -> AppResult<()> {
    let dir = PathBuf::from(&root).join(".latex-editor");
    std::fs::create_dir_all(&dir)?;
    std::fs::write(
        dir.join("settings.json"),
        serde_json::to_string_pretty(&settings)?,
    )?;
    Ok(())
}

#[tauri::command]
pub fn get_app_settings(app: AppHandle) -> Value {
    match app.path().app_data_dir() {
        Ok(dir) => read_json(&dir.join("settings.json"), default_app_settings()),
        Err(_) => default_app_settings(),
    }
}

#[tauri::command]
pub fn save_app_settings(app: AppHandle, settings: Value) -> AppResult<()> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| crate::error::AppError(format!("app data dir: {e}")))?;
    std::fs::create_dir_all(&dir)?;
    std::fs::write(
        dir.join("settings.json"),
        serde_json::to_string_pretty(&settings)?,
    )?;
    Ok(())
}

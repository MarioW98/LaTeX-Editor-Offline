//! Global (per-user) and per-project settings.
//!
//! - Global settings live in `<app data dir>/settings.json` (theme, editor
//!   preferences, default engine, recent projects, optional LaTeX PATH
//!   override).
//! - Project settings live in `<project>/.latex-editor/settings.json`
//!   (main file, engine, output dir, latexmk, shell-escape).
//! - Project metadata lives in `<project>/.latex-editor/project.json`.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct GlobalSettings {
    pub theme: String, // "dark" | "light"
    pub font_size: u32,
    pub word_wrap: bool,
    pub default_engine: String, // pdflatex | xelatex | lualatex
    pub autosave_enabled: bool,
    pub autosave_delay_ms: u64,
    pub latex_path_override: Option<String>,
    pub recent_projects: Vec<String>,
}

impl Default for GlobalSettings {
    fn default() -> Self {
        Self {
            theme: "dark".into(),
            font_size: 14,
            word_wrap: false,
            default_engine: "pdflatex".into(),
            autosave_enabled: true,
            autosave_delay_ms: 1500,
            latex_path_override: None,
            recent_projects: Vec::new(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct ProjectSettings {
    pub main_file: String,
    pub engine: String,
    pub output_dir: String,
    pub use_latexmk: bool,
    pub shell_escape: bool,
}

impl Default for ProjectSettings {
    fn default() -> Self {
        Self {
            main_file: "main.tex".into(),
            engine: "pdflatex".into(),
            output_dir: ".latex-editor/build".into(),
            use_latexmk: true,
            shell_escape: false,
        }
    }
}

fn global_settings_path(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app.path().app_data_dir().map_err(|e| {
        AppError::msg(format!("Impossibile determinare la cartella dati dell'app: {e}"))
    })?;
    Ok(dir.join("settings.json"))
}

pub fn load_global(app: &AppHandle) -> GlobalSettings {
    let path = match global_settings_path(app) {
        Ok(p) => p,
        Err(_) => return GlobalSettings::default(),
    };
    match std::fs::read(&path) {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
        Err(_) => GlobalSettings::default(),
    }
}

pub fn save_global(app: &AppHandle, settings: &GlobalSettings) -> AppResult<()> {
    let path = global_settings_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_vec_pretty(settings)?;
    atomic_write(&path, &json)
}

pub fn project_settings_path(root: &Path) -> PathBuf {
    root.join(".latex-editor").join("settings.json")
}

pub fn project_meta_path(root: &Path) -> PathBuf {
    root.join(".latex-editor").join("project.json")
}

/// Read project settings; when `settings.json` is missing, seed the main file
/// from `project.json` if it declares one.
pub fn load_project(root: &Path) -> ProjectSettings {
    let settings_file = project_settings_path(root);
    let mut settings = match std::fs::read(&settings_file) {
        Ok(bytes) => serde_json::from_slice::<ProjectSettings>(&bytes).unwrap_or_default(),
        Err(_) => ProjectSettings::default(),
    };
    if !settings_file.is_file() {
        if let Ok(bytes) = std::fs::read(project_meta_path(root)) {
            if let Ok(meta) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                if let Some(main_file) = meta.get("mainFile").and_then(|v| v.as_str()) {
                    if settings.main_file == "main.tex" && !main_file.is_empty() {
                        settings.main_file = main_file.to_string();
                    }
                }
                if let Some(engine) = meta.get("engine").and_then(|v| v.as_str()) {
                    if ["pdflatex", "xelatex", "lualatex"].contains(&engine) {
                        settings.engine = engine.to_string();
                    }
                }
            }
        }
    }
    settings
}

pub fn save_project(root: &Path, settings: &ProjectSettings) -> AppResult<()> {
    let path = project_settings_path(root);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_vec_pretty(settings)?;
    atomic_write(&path, &json)
}

/// Read the project display name from `.latex-editor/project.json`.
pub fn project_name(root: &Path) -> Option<String> {
    let bytes = std::fs::read(project_meta_path(root)).ok()?;
    let meta = serde_json::from_slice::<serde_json::Value>(&bytes).ok()?;
    meta.get("name")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

/// Write to a temporary file first, then rename: a crash mid-write can never
/// corrupt the original file.
fn atomic_write(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

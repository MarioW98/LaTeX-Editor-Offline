//! Impostazioni globali (cartella dati dell'app) e per progetto
//! (`.latex-editor/project.json`).

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::error::AppError;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Impostazioni globali
// ---------------------------------------------------------------------------

#[derive(Deserialize, Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct GlobalSettings {
    /// Cartella bin LaTeX personalizzata oppure percorso completo di un eseguibile.
    pub latex_bin_dir: Option<String>,
    /// Motore predefinito per i nuovi progetti.
    pub default_engine: String,
    pub autosave: bool,
    pub autosave_delay_ms: u64,
    pub editor_font_size: u32,
    pub word_wrap: bool,
    /// "dark" | "light".
    pub theme: String,
    /// Mostra l'avviso quando shell-escape è attivo.
    pub warn_shell_escape: bool,
    /// Abilita davvero `-shell-escape` (default: false, sconsigliato).
    pub allow_shell_escape: bool,
    pub recent_projects: Vec<String>,
}

impl Default for GlobalSettings {
    fn default() -> Self {
        Self {
            latex_bin_dir: None,
            default_engine: "pdflatex".into(),
            autosave: false,
            autosave_delay_ms: 1500,
            editor_font_size: 14,
            word_wrap: true,
            theme: "dark".into(),
            warn_shell_escape: true,
            allow_shell_escape: false,
            recent_projects: Vec::new(),
        }
    }
}

fn global_settings_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|_| AppError::Invalid("cartella dati dell'app non disponibile".into()))?;
    Ok(dir.join("settings.json"))
}

#[tauri::command]
pub fn read_global_settings(app: AppHandle) -> Result<GlobalSettings, AppError> {
    let path = global_settings_path(&app)?;
    match std::fs::read_to_string(&path) {
        Ok(text) => Ok(serde_json::from_str(&text)?),
        Err(_) => Ok(GlobalSettings::default()),
    }
}

#[tauri::command]
pub fn write_global_settings(settings: GlobalSettings, app: AppHandle) -> Result<(), AppError> {
    let path = global_settings_path(&app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&path, serde_json::to_string_pretty(&settings)?)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Metadati progetto (`.latex-editor/project.json`)
// ---------------------------------------------------------------------------

#[derive(Deserialize, Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct ProjectLocalSettings {
    /// Override locali: `None` = usa il valore globale.
    pub autosave: Option<bool>,
    pub autosave_delay_ms: Option<u64>,
    pub editor_font_size: Option<u32>,
    pub word_wrap: Option<bool>,
    pub warn_shell_escape: Option<bool>,
}

impl Default for ProjectLocalSettings {
    fn default() -> Self {
        Self {
            autosave: None,
            autosave_delay_ms: None,
            editor_font_size: None,
            word_wrap: None,
            warn_shell_escape: None,
        }
    }
}

#[derive(Deserialize, Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct ProjectMeta {
    pub name: String,
    /// File principale relativo alla radice (es. "main.tex").
    pub main_file: String,
    /// "pdflatex" | "xelatex" | "lualatex".
    pub engine: String,
    /// Usa latexmk se disponibile.
    pub use_latexmk: bool,
    /// Directory di output relativa.
    pub output_dir: String,
    pub settings: ProjectLocalSettings,
    /// Epoch in secondi.
    pub created_at: u64,
    pub updated_at: u64,
}

impl Default for ProjectMeta {
    fn default() -> Self {
        Self {
            name: "progetto".into(),
            main_file: "main.tex".into(),
            engine: "pdflatex".into(),
            use_latexmk: true,
            output_dir: ".latex-editor/build".into(),
            settings: ProjectLocalSettings::default(),
            created_at: 0,
            updated_at: 0,
        }
    }
}

fn now_epoch() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn meta_path(root: &std::path::Path) -> PathBuf {
    root.join(".latex-editor").join("project.json")
}

/// Individua un main file plausibile in un progetto appena aperto.
fn guess_main_file(root: &std::path::Path) -> String {
    if root.join("main.tex").is_file() {
        return "main.tex".into();
    }
    // Cerca (max 2 livelli) un .tex con \documentclass.
    let mut candidates: Vec<String> = Vec::new();
    collect_tex_candidates(root, "", 2, &mut candidates);
    for rel in candidates {
        if let Ok(text) = std::fs::read_to_string(root.join(&rel)) {
            if text.contains("\\documentclass") {
                return rel;
            }
        }
    }
    "main.tex".into()
}

fn collect_tex_candidates(dir: &std::path::Path, rel: &str, depth: u8, out: &mut Vec<String>) {
    if depth == 0 || out.len() > 200 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let Ok(ft) = e.file_type() else { continue };
        let name = e.file_name().to_string_lossy().to_string();
        let child_rel = if rel.is_empty() { name.clone() } else { format!("{rel}/{name}") };
        if ft.is_dir() {
            if name == ".git" || name == ".latex-editor" {
                continue;
            }
            collect_tex_candidates(&e.path(), &child_rel, depth - 1, out);
        } else if name.ends_with(".tex") {
            out.push(child_rel);
        }
    }
}

/// Legge i metadati del progetto; se assenti restituisce (e opzionalmente
/// persiste) i default. `persist_if_missing` evita scritture in lettura pura.
pub fn read_meta(root: &std::path::Path, persist_if_missing: bool) -> Result<ProjectMeta, AppError> {
    let path = meta_path(root);
    if path.is_file() {
        let text = std::fs::read_to_string(&path)?;
        let meta: ProjectMeta = serde_json::from_str(&text)?;
        return Ok(meta);
    }
    let name = root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "progetto".into());
    let mut meta = ProjectMeta {
        name,
        main_file: guess_main_file(root),
        created_at: now_epoch(),
        ..ProjectMeta::default()
    };
    meta.updated_at = meta.created_at;
    if persist_if_missing {
        meta = write_meta(root, meta)?;
    }
    Ok(meta)
}

pub fn write_meta(root: &std::path::Path, mut meta: ProjectMeta) -> Result<ProjectMeta, AppError> {
    let path = meta_path(root);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    meta.updated_at = now_epoch();
    if meta.created_at == 0 {
        meta.created_at = meta.updated_at;
    }
    std::fs::write(&path, serde_json::to_string_pretty(&meta)?)?;
    Ok(meta)
}

#[tauri::command]
pub fn read_project_settings(state: State<'_, AppState>) -> Result<ProjectMeta, AppError> {
    let root = state.root()?;
    read_meta(&root, false)
}

#[tauri::command]
pub fn write_project_settings(meta: ProjectMeta, state: State<'_, AppState>) -> Result<ProjectMeta, AppError> {
    let root = state.root()?;
    write_meta(&root, meta)
}

//! Comandi filesystem sandboxati: tutte le operazioni sono confinate
//! nella cartella progetto aperta (vedi `fs::sandbox`).

use std::path::PathBuf;
use std::time::UNIX_EPOCH;

use serde::Serialize;
use tauri::State;

use crate::error::AppError;
use crate::fs::sandbox;
use crate::state::AppState;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileStat {
    pub exists: bool,
    /// Millisecondi dall'epoch (0 se sconosciuto).
    pub mtime_ms: u64,
    pub size: u64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub text: String,
    pub stat: FileStat,
}

fn stat_of(path: &std::path::Path) -> FileStat {
    match std::fs::metadata(path) {
        Ok(m) => FileStat {
            exists: true,
            mtime_ms: mtime
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0),
            size: m.len(),
        },
        Err(_) => FileStat {
            exists: false,
            mtime_ms: 0,
            size: 0,
        },
    }
}

#[tauri::command]
pub fn read_file(path: String, state: State<'_, AppState>) -> Result<FileContent, AppError> {
    let root = state.root()?;
    let target = sandbox::resolve_in_root(&root, &path)?;
    if !target.is_file() {
        return Err(AppError::NotFound(path));
    }
    // Limite difensivo per evitare di caricare file enormi nell'editor.
    let len = std::fs::metadata(&target).map(|m| m.len()).unwrap_or(0);
    if len > 16 * 1024 * 1024 {
        return Err(AppError::Invalid("file troppo grande per l'editor (limite 16 MB)".into()));
    }
    let text = std::fs::read_to_string(&target)?;
    let stat = stat_of(&target);
    Ok(FileContent { text, stat })
}

#[tauri::command]
pub fn write_file(path: String, content: String, state: State<'_, AppState>) -> Result<FileStat, AppError> {
    let root = state.root()?;
    let target = sandbox::resolve_in_root(&root, &path)?;
    if let Some(parent) = target.parent() {
        if !parent.exists() {
            return Err(AppError::NotFound(parent.display().to_string()));
        }
    }
    std::fs::write(&target, content)?;
    Ok(stat_of(&target))
}

#[tauri::command]
pub fn create_entry(path: String, is_dir: bool, state: State<'_, AppState>) -> Result<(), AppError> {
    let root = state.root()?;
    let target = sandbox::resolve_in_root(&root, &path)?;
    if target.exists() {
        return Err(AppError::Exists(path));
    }
    if let Some(parent) = target.parent() {
        if !parent.exists() {
            return Err(AppError::NotFound(parent.display().to_string()));
        }
    }
    if is_dir {
        std::fs::create_dir(&target)?;
    } else {
        std::fs::write(&target, "")?;
    }
    Ok(())
}

#[tauri::command]
pub fn rename_entry(from: String, to: String, state: State<'_, AppState>) -> Result<(), AppError> {
    let root = state.root()?;
    let src = sandbox::resolve_in_root(&root, &from)?;
    let dst = sandbox::resolve_in_root(&root, &to)?;
    if !src.exists() {
        return Err(AppError::NotFound(from));
    }
    if dst.exists() {
        return Err(AppError::Exists(to));
    }
    if src == root {
        return Err(AppError::InvalidPath("impossibile rinominare la radice del progetto".into()));
    }
    std::fs::rename(&src, &dst)?;
    Ok(())
}

#[tauri::command]
pub fn delete_entry(path: String, state: State<'_, AppState>) -> Result<(), AppError> {
    let root = state.root()?;
    let target = sandbox::resolve_in_root(&root, &path)?;
    if target == root {
        return Err(AppError::InvalidPath("impossibile eliminare la radice del progetto".into()));
    }
    if !target.exists() {
        return Err(AppError::NotFound(path));
    }
    if target.is_dir() {
        std::fs::remove_dir_all(&target)?;
    } else {
        std::fs::remove_file(&target)?;
    }
    Ok(())
}

#[tauri::command]
pub fn file_stat(path: String, state: State<'_, AppState>) -> Result<FileStat, AppError> {
    let root = state.root()?;
    let target = sandbox::resolve_in_root(&root, &path)?;
    Ok(stat_of(&target))
}

/// Legge il PDF compilato e lo restituisce in base64.
/// Accetta sia un percorso assoluto (prodotto dagli eventi di build) sia uno
/// relativo; in ogni caso deve restare dentro il progetto.
#[tauri::command]
pub fn read_pdf(path: String, state: State<'_, AppState>) -> Result<String, AppError> {
    use base64::Engine as _;
    let root = state.root()?;
    let raw = PathBuf::from(&path);
    let target = if raw.is_absolute() {
        sandbox::ensure_within(&root, &raw).map_err(AppError::from)?
    } else {
        sandbox::resolve_in_root(&root, &path)?
    };
    if target.extension().map(|e| e.to_string_lossy().to_lowercase()).as_deref() != Some("pdf") {
        return Err(AppError::Invalid("il file richiesto non è un PDF".into()));
    }
    let bytes = std::fs::read(&target)?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

//! Project and file-system commands (all sandboxed to the project folder).

use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::sandbox::{self, FileEntry};
use crate::settings::{self, ProjectSettings};

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub root: String,
    pub name: String,
    pub tree: Vec<FileEntry>,
    pub settings: ProjectSettings,
    pub has_project_json: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileStat {
    pub mtime_ms: f64,
    pub size: u64,
}

fn stat_of(path: &std::path::Path) -> AppResult<FileStat> {
    let meta = std::fs::metadata(path)?;
    let mtime_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0);
    Ok(FileStat {
        mtime_ms,
        size: meta.len(),
    })
}

/// Open (validate) a project folder: returns name, file tree and settings.
#[tauri::command]
pub fn open_project(root: String) -> AppResult<ProjectInfo> {
    let root_p = sandbox::validate_root(&root)?;
    let has_project_json = settings::project_meta_path(&root_p).is_file();
    let name = settings::project_name(&root_p).unwrap_or_else(|| {
        root_p
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "Progetto".into())
    });
    let project_settings = settings::load_project(&root_p);
    let tree = sandbox::build_tree(&root_p)?;
    Ok(ProjectInfo {
        root: root_p.to_string_lossy().into_owned(),
        name,
        tree,
        settings: project_settings,
        has_project_json,
    })
}

/// Refresh the project file tree.
#[tauri::command]
pub fn read_file_tree(project_root: String) -> AppResult<Vec<FileEntry>> {
    let root = sandbox::validate_root(&project_root)?;
    sandbox::build_tree(&root)
}

/// Read a text file (UTF-8 with lossy fallback) inside the project.
#[tauri::command]
pub fn read_file(project_root: String, path: String) -> AppResult<String> {
    let root = sandbox::validate_root(&project_root)?;
    let full = sandbox::ensure_inside(&root, &path)?;
    if !full.is_file() {
        return Err(AppError::NotFound(format!("File non trovato: {path}")));
    }
    let bytes = std::fs::read(&full)?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// Write a text file atomically (temp file + rename) and return its stat so
/// the editor can track external modifications.
#[tauri::command]
pub fn write_file(project_root: String, path: String, contents: String) -> AppResult<FileStat> {
    let root = sandbox::validate_root(&project_root)?;
    let full = sandbox::ensure_inside(&root, &path)?;
    let tmp = full.with_extension("tmp-sw");
    std::fs::write(&tmp, contents)?;
    std::fs::rename(&tmp, &full)?;
    stat_of(&full)
}

/// Create a file or folder; the parent directory must already exist.
#[tauri::command]
pub fn create_entry(project_root: String, path: String, is_dir: bool) -> AppResult<()> {
    let root = sandbox::validate_root(&project_root)?;
    let full = sandbox::ensure_inside(&root, &path)?;
    if full.exists() {
        return Err(AppError::msg(format!("'{}' esiste già.", full.display())));
    }
    if is_dir {
        std::fs::create_dir_all(&full)?;
    } else {
        std::fs::write(&full, "")?;
    }
    Ok(())
}

/// Rename/move an entry inside the project (new path must be given in full).
#[tauri::command]
pub fn rename_entry(project_root: String, old_path: String, new_path: String) -> AppResult<()> {
    let root = sandbox::validate_root(&project_root)?;
    let old = sandbox::ensure_inside(&root, &old_path)?;
    let new = sandbox::ensure_inside(&root, &new_path)?;
    if !old.exists() {
        return Err(AppError::NotFound(format!("Non trovato: {old_path}")));
    }
    if new.exists() {
        return Err(AppError::msg(format!(
            "'{}' esiste già.",
            new.display()
        )));
    }
    std::fs::rename(&old, &new)?;
    Ok(())
}

/// Delete a file or folder (never the project root itself).
#[tauri::command]
pub fn delete_entry(project_root: String, path: String) -> AppResult<()> {
    let root = sandbox::validate_root(&project_root)?;
    let full = sandbox::ensure_inside(&root, &path)?;
    if full == root {
        return Err(AppError::msg("Impossibile eliminare la cartella del progetto."));
    }
    if !full.exists() {
        return Err(AppError::NotFound(format!("Non trovato: {path}")));
    }
    if full.is_dir() {
        std::fs::remove_dir_all(&full)?;
    } else {
        std::fs::remove_file(&full)?;
    }
    Ok(())
}

/// Stat a file (mtime in milliseconds since epoch + size).
#[tauri::command]
pub fn stat_file(project_root: String, path: String) -> AppResult<FileStat> {
    let root = sandbox::validate_root(&project_root)?;
    let full = sandbox::ensure_inside(&root, &path)?;
    if !full.exists() {
        return Err(AppError::NotFound(format!("Non trovato: {path}")));
    }
    stat_of(&full)
}

/// Read a PDF file as raw bytes. Uses the Tauri 2 raw IPC response so the
/// binary payload is transferred efficiently (no base64/JSON overhead).
#[tauri::command]
pub fn read_pdf_bytes(project_root: String, path: String) -> Result<tauri::ipc::Response, AppError> {
    let root = sandbox::validate_root(&project_root)?;
    let full = sandbox::ensure_inside(&root, &path)?;
    if !full.is_file() {
        return Err(AppError::NotFound(format!("File non trovato: {path}")));
    }
    let bytes = std::fs::read(&full)?;
    Ok(tauri::ipc::Response::new(bytes))
}

//! Comandi di gestione progetto: apertura, creazione da template,
//! albero file, raccolta etichette.

use std::path::PathBuf;

use serde::Serialize;
use tauri::State;

use crate::commands::settings::{read_meta, write_meta, ProjectMeta};
use crate::error::AppError;
use crate::fs::{labels, sandbox, tree, tree::FileNode};
use crate::state::AppState;
use crate::templates;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSnapshot {
    /// Radice assoluta (normalizzata) della cartella progetto.
    pub root: String,
    pub meta: ProjectMeta,
    pub tree: FileNode,
}

fn snapshot_of(root: &std::path::Path, meta: ProjectMeta) -> Result<ProjectSnapshot, AppError> {
    let root_name = root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "progetto".into());
    let t = tree::build_tree(root, &meta.output_dir, &root_name)?;
    Ok(ProjectSnapshot {
        root: root.display().to_string(),
        meta,
        tree: t,
    })
}

#[tauri::command]
pub fn open_project(path: String, state: State<'_, AppState>) -> Result<ProjectSnapshot, AppError> {
    let raw = PathBuf::from(&path);
    if !raw.is_dir() {
        return Err(AppError::NotFound(format!("cartella non trovata: {path}")));
    }
    let root = sandbox::normalize(&raw.canonicalize()?);
    state.set_root(Some(root.clone()));
    // Persiste i default se il progetto non ha ancora project.json.
    let meta = read_meta(&root, true)?;
    snapshot_of(&root, meta)
}

#[tauri::command]
pub fn create_project(
    parent_dir: String,
    name: String,
    template: String,
    state: State<'_, AppState>,
) -> Result<ProjectSnapshot, AppError> {
    let parent = PathBuf::from(&parent_dir);
    if !parent.is_dir() {
        return Err(AppError::NotFound(format!("cartella non trovata: {parent_dir}")));
    }
    let clean = sanitize_name(&name)?;
    let root = parent.join(&clean);
    if root.exists() {
        return Err(AppError::Exists(root.display().to_string()));
    }
    let tpl = templates::get(&template)
        .ok_or_else(|| AppError::Invalid(format!("template sconosciuto: {template}")))?;
    std::fs::create_dir_all(&root)?;
    for (rel, content) in tpl.files {
        // I separatori `/` funzionano anche su Windows per i percorsi relativi.
        let target = root.join(rel);
        if let Some(dir) = target.parent() {
            std::fs::create_dir_all(dir)?;
        }
        std::fs::write(&target, content)?;
    }
    // project.json viene rigenerato con nome e timestamp reali.
    let meta = write_meta(&root, ProjectMeta { name: clean, ..ProjectMeta::default() })?;
    let root_c = sandbox::normalize(&root.canonicalize()?);
    state.set_root(Some(root_c.clone()));
    snapshot_of(&root_c, meta)
}

fn sanitize_name(name: &str) -> Result<String, AppError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::Invalid("il nome del progetto è vuoto".into()));
    }
    if trimmed.len() > 80 {
        return Err(AppError::Invalid("il nome del progetto è troppo lungo".into()));
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains("..") || trimmed.starts_with('.') {
        return Err(AppError::Invalid("il nome del progetto contiene caratteri non ammessi".into()));
    }
    Ok(trimmed.to_string())
}

#[tauri::command]
pub fn read_file_tree(state: State<'_, AppState>) -> Result<FileNode, AppError> {
    let root = state.root()?;
    let meta = read_meta(&root, false)?;
    let root_name = root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "progetto".into());
    tree::build_tree(&root, &meta.output_dir, &root_name)
}

#[tauri::command]
pub fn collect_labels(state: State<'_, AppState>) -> Result<labels::LabelsIndex, AppError> {
    let root = state.root()?;
    let meta = read_meta(&root, false)?;
    Ok(labels::collect(&root, &meta.output_dir))
}

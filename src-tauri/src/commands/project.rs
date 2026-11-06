use serde::Serialize;
use std::path::{Component, Path, PathBuf};

use crate::error::{AppError, AppResult};
use crate::textfile::{read_file_content, FileContent};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    pub name: String,
    /// Path relative to the project root, using forward slashes.
    pub path: String,
    pub kind: String, // "file" | "dir"
    pub children: Option<Vec<FileNode>>,
}

const SKIP_DIRS: [&str; 5] = [".git", "node_modules", "target", ".latex-editor", "dist"];

fn is_skipped_dir(name: &str) -> bool {
    SKIP_DIRS.contains(&name)
}

/// Join `rel` onto `root`, rejecting anything that would escape the project
/// folder (absolute paths, `..` components, Windows prefixes).
pub fn resolve_in_root(root: &Path, rel: &str) -> AppResult<PathBuf> {
    let rel_path = Path::new(rel);
    let mut normalized = PathBuf::new();
    for comp in rel_path.components() {
        match comp {
            Component::Normal(c) => normalized.push(c),
            Component::CurDir => {}
            _ => {
                return Err(AppError(format!(
                    "percorso non valido (fuori dal progetto?): {rel}"
                )))
            }
        }
    }
    Ok(root.join(normalized))
}

fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name != "."
        && name != ".."
        && !name.contains('/')
        && !name.contains('\\')
        && !name.contains(':')
        && !name.contains('*')
        && !name.contains('?')
        && !name.contains('<')
        && !name.contains('>')
        && !name.contains('|')
        && !name.starts_with(' ')
        && !name.ends_with(' ')
}

fn read_dir_recursive(dir: &Path, rel: &str) -> std::io::Result<Vec<FileNode>> {
    let mut nodes: Vec<FileNode> = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let path = if rel.is_empty() {
            name.clone()
        } else {
            format!("{rel}/{name}")
        };
        let ft = entry.file_type()?;
        if ft.is_dir() {
            if is_skipped_dir(&name) {
                continue;
            }
            let children = read_dir_recursive(&entry.path(), &path)?;
            nodes.push(FileNode {
                name,
                path,
                kind: "dir".into(),
                children: Some(children),
            });
        } else if ft.is_file() {
            nodes.push(FileNode {
                name,
                path,
                kind: "file".into(),
                children: None,
            });
        }
    }
    nodes.sort_by(|a, b| {
        a.kind
            .cmp(&b.kind) // directories first
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(nodes)
}

#[tauri::command]
pub async fn select_project_folder() -> AppResult<Option<String>> {
    let picked = tauri::async_runtime::spawn_blocking(|| {
        rfd::FileDialog::new()
            .set_title("Seleziona la cartella del progetto LaTeX")
            .pick_folder()
    })
    .await
    .map_err(|e| AppError(format!("folder picker failed: {e}")))?;
    Ok(picked.map(|p| p.to_string_lossy().into_owned()))
}

#[tauri::command]
pub async fn read_file_tree(root: String) -> AppResult<Vec<FileNode>> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = PathBuf::from(root);
        if !root.is_dir() {
            return Err(AppError("la cartella del progetto non esiste".into()));
        }
        Ok(read_dir_recursive(&root, "")?)
    })
    .await
    .map_err(|e| AppError(format!("task failed: {e}")))?
}

#[tauri::command]
pub async fn read_file(root: String, path: String) -> AppResult<FileContent> {
    tauri::async_runtime::spawn_blocking(move || {
        let full = resolve_in_root(Path::new(&root), &path)?;
        // Classification lives in the pure `textfile` module: only valid
        // UTF-8 without NUL bytes is reported as editable text; everything
        // else comes back flagged non-modifiable and never lossy.
        read_file_content(&full)
    })
    .await
    .map_err(|e| AppError(format!("task failed: {e}")))?
}

#[tauri::command]
pub async fn write_file(root: String, path: String, content: String) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let full = resolve_in_root(Path::new(&root), &path)?;
        // Atomic replacement (temp file in the same directory + fsync +
        // rename over the destination): a crash mid-write can no longer
        // truncate the file, and a failed write leaves the original intact.
        crate::atomic_io::write_atomic(&full, content.as_bytes())
    })
    .await
    .map_err(|e| AppError(format!("task failed: {e}")))?
}

#[tauri::command]
pub async fn create_item(
    root: String,
    parent: String,
    name: String,
    kind: String,
) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        if !valid_name(&name) {
            return Err(AppError(format!("nome non valido: {name:?}")));
        }
        let base = resolve_in_root(Path::new(&root), &parent)?;
        let full = base.join(&name);
        if full.exists() {
            return Err(AppError("esiste già un elemento con questo nome".into()));
        }
        if kind == "dir" {
            std::fs::create_dir_all(&full)?;
        } else {
            if let Some(p) = full.parent() {
                std::fs::create_dir_all(p)?;
            }
            std::fs::File::create(&full)?;
        }
        Ok(())
    })
    .await
    .map_err(|e| AppError(format!("task failed: {e}")))?
}

#[tauri::command]
pub async fn rename_item(root: String, path: String, new_name: String) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        if !valid_name(&new_name) {
            return Err(AppError(format!("nome non valido: {new_name:?}")));
        }
        let full = resolve_in_root(Path::new(&root), &path)?;
        if !full.exists() {
            return Err(AppError("l'elemento da rinominare non esiste".into()));
        }
        let dest = match full.parent() {
            Some(p) => p.join(&new_name),
            None => return Err(AppError("percorso sorgente non valido".into())),
        };
        if dest.exists() {
            return Err(AppError("esiste già un elemento con questo nome".into()));
        }
        std::fs::rename(&full, &dest)?;
        Ok(())
    })
    .await
    .map_err(|e| AppError(format!("task failed: {e}")))?
}

#[tauri::command]
pub async fn delete_item(root: String, path: String) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let rel = path.trim().trim_matches('/');
        if rel.is_empty() || rel == "." || rel == ".." {
            return Err(AppError(
                "impossibile eliminare la radice del progetto".into(),
            ));
        }
        let full = resolve_in_root(Path::new(&root), &path)?;
        if !full.exists() {
            return Ok(());
        }
        if full.is_dir() {
            std::fs::remove_dir_all(&full)?;
        } else {
            std::fs::remove_file(&full)?;
        }
        Ok(())
    })
    .await
    .map_err(|e| AppError(format!("task failed: {e}")))?
}

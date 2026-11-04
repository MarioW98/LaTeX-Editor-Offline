//! File-system sandbox.
//!
//! Every path coming from the frontend is validated here before any I/O:
//! - the project root must exist and be a directory;
//! - every target path must resolve *inside* the (canonicalized) project root,
//!   which also defeats symlink escapes;
//! - file and folder names are sanitized (no `..`, no separators, no reserved
//!   Windows characters);
//! - relative paths (main file, output dir) must be relative and cannot
//!   traverse upwards with `..`.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{AppError, AppResult};

/// A node of the project file tree sent to the frontend.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileEntry>>,
}

/// Remove the `\\?\` verbatim prefix that Windows `canonicalize()` adds,
/// so containment checks work with mixed inputs.
fn strip_verbatim(p: PathBuf) -> PathBuf {
    if let Some(s) = p.to_str() {
        if let Some(rest) = s.strip_prefix(r"\\?\") {
            return PathBuf::from(rest);
        }
    }
    p
}

/// Validate and canonicalize a project root chosen by the user.
pub fn validate_root(root: &str) -> AppResult<PathBuf> {
    if root.trim().is_empty() {
        return Err(AppError::msg("Nessuna cartella di progetto selezionata."));
    }
    let p = PathBuf::from(root);
    if !p.is_dir() {
        return Err(AppError::NotFound(format!(
            "La cartella del progetto non esiste: {root}"
        )));
    }
    Ok(strip_verbatim(
        p.canonicalize().map_err(|e| AppError::Io(e))?,
    ))
}

/// Validate a single file/folder name.
pub fn validate_file_name(name: &str) -> AppResult<()> {
    if name.is_empty() || name == "." || name == ".." {
        return Err(AppError::InvalidPath("Il nome non può essere vuoto.".into()));
    }
    if name.contains('/') || name.contains('\\') || name.contains('\0') {
        return Err(AppError::InvalidPath(format!(
            "Il nome non può contenere separatori di percorso: {name}"
        )));
    }
    if name
        .chars()
        .any(|c| matches!(c, ':' | '*' | '?' | '"' | '<' | '>' | '|'))
    {
        return Err(AppError::InvalidPath(format!(
            "Il nome contiene caratteri non ammessi: {name}"
        )));
    }
    Ok(())
}

/// Resolve `target` (absolute path coming from the UI) and guarantee it lies
/// inside `root`. For not-yet-existing entries the parent must exist and the
/// file name is validated explicitly.
pub fn ensure_inside(root: &Path, target: &str) -> AppResult<PathBuf> {
    if target.trim().is_empty() {
        return Err(AppError::InvalidPath("Percorso vuoto.".into()));
    }
    let raw = PathBuf::from(target);
    let resolved = if raw.exists() {
        strip_verbatim(raw.canonicalize().map_err(AppError::Io)?)
    } else {
        let name = raw
            .file_name()
            .ok_or_else(|| AppError::InvalidPath("Percorso non valido.".into()))?
            .to_string_lossy()
            .into_owned();
        validate_file_name(&name)?;
        let parent = raw
            .parent()
            .ok_or_else(|| AppError::InvalidPath("Percorso non valido.".into()))?;
        let parent_c = if parent.as_os_str().is_empty() {
            root.to_path_buf()
        } else {
            strip_verbatim(parent.canonicalize().map_err(AppError::Io)?)
        };
        parent_c.join(&name)
    };

    if !resolved.starts_with(root) {
        return Err(AppError::OutsideProject(resolved.display().to_string()));
    }
    Ok(resolved)
}

/// Sanitize a relative path (main file, output dir): reject absolute paths
/// and `..` traversal, normalize separators to `/`.
pub fn sanitize_relative(rel: &str) -> AppResult<String> {
    let rel = rel.trim().replace('\\', "/");
    if rel.is_empty() {
        return Err(AppError::InvalidPath("Percorso relativo vuoto.".into()));
    }
    if rel.starts_with('/') || Path::new(&rel).is_absolute() {
        return Err(AppError::InvalidPath(format!(
            "Sono ammessi solo percorsi relativi: {rel}"
        )));
    }
    let mut parts: Vec<&str> = Vec::new();
    for part in rel.split('/') {
        match part {
            "" | "." => continue,
            ".." => {
                return Err(AppError::InvalidPath(
                    "Impossibile usare '..' nei percorsi del progetto.".into(),
                ))
            }
            p => parts.push(p),
        }
    }
    if parts.is_empty() {
        return Err(AppError::InvalidPath("Percorso relativo vuoto.".into()));
    }
    Ok(parts.join("/"))
}

/// Join a validated relative path onto the project root.
pub fn resolve_relative(root: &Path, rel: &str) -> AppResult<PathBuf> {
    let cleaned = sanitize_relative(rel)?;
    Ok(root.join(cleaned))
}

const MAX_DEPTH: u32 = 16;
const MAX_ENTRIES: usize = 4000;
const SKIP_DIRS: [&str; 2] = [".git", "node_modules"];

/// Build the full project tree (directories first, case-insensitive order).
/// `.latex-editor/build` is hidden, everything else in `.latex-editor` is kept
/// so the user can inspect `settings.json` / `project.json`.
pub fn build_tree(root: &Path) -> AppResult<Vec<FileEntry>> {
    let mut count = 0usize;
    walk(root, 0, &mut count)
}

fn walk(dir: &Path, depth: u32, count: &mut usize) -> AppResult<Vec<FileEntry>> {
    let mut out: Vec<FileEntry> = Vec::new();
    if depth > MAX_DEPTH {
        return Ok(out);
    }
    let read = std::fs::read_dir(dir).map_err(AppError::Io)?;
    let mut list: Vec<(String, PathBuf, bool)> = Vec::new();
    for entry in read.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let path = entry.path();
        let is_dir = path.is_dir();
        if is_dir && SKIP_DIRS.contains(&name.as_str()) {
            continue;
        }
        list.push((name, path, is_dir));
    }
    list.sort_by(|a, b| match (a.2, b.2) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.0.to_lowercase().cmp(&b.0.to_lowercase()),
    });

    for (name, path, is_dir) in list {
        if *count >= MAX_ENTRIES {
            break;
        }
        *count += 1;
        let children = if is_dir {
            if name == ".latex-editor" {
                Some(latex_editor_children(&path))
            } else {
                Some(walk(&path, depth + 1, count)?)
            }
        } else {
            None
        };
        out.push(FileEntry {
            name,
            path: path.to_string_lossy().into_owned(),
            is_dir,
            children,
        });
    }
    Ok(out)
}

/// Children of `.latex-editor` with the `build` output folder filtered out.
fn latex_editor_children(dir: &Path) -> Vec<FileEntry> {
    let mut list: Vec<(String, PathBuf, bool)> = Vec::new();
    if let Ok(rd) = std::fs::read_dir(dir) {
        for entry in rd.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name == "build" {
                continue;
            }
            let path = entry.path();
            let is_dir = path.is_dir();
            list.push((name, path, is_dir));
        }
    }
    list.sort_by(|a, b| match (a.2, b.2) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.0.to_lowercase().cmp(&b.0.to_lowercase()),
    });
    list.into_iter()
        .map(|(name, path, is_dir)| FileEntry {
            name,
            path: path.to_string_lossy().into_owned(),
            is_dir,
            children: if is_dir { Some(Vec::new()) } else { None },
        })
        .collect()
}

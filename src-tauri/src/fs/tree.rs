//! Costruzione dell'albero file del progetto (per il file tree del frontend).

use std::path::Path;

use serde::Serialize;

use crate::error::AppError;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    pub name: String,
    /// Percorso relativo alla radice, con separatori `/`.
    pub path: String,
    /// `"dir"` oppure `"file"`.
    pub kind: String,
    pub children: Option<Vec<FileNode>>,
}

/// Cartelle sempre escluse dall'albero.
const SKIP_DIRS: [&str; 2] = [".git", "node_modules"];
const MAX_ENTRIES: usize = 4000;
const MAX_DEPTH: usize = 16;

pub fn build_tree(root: &Path, out_dir_rel: &str, root_name: &str) -> Result<FileNode, AppError> {
    let mut count = 0usize;
    walk(root, "", root_name, 0, out_dir_rel, &mut count)
}

fn empty_dir(name: &str, rel: &str) -> FileNode {
    FileNode {
        name: name.to_string(),
        path: rel.to_string(),
        kind: "dir".to_string(),
        children: Some(Vec::new()),
    }
}

fn walk(
    abs: &Path,
    rel: &str,
    name: &str,
    depth: usize,
    out_rel: &str,
    count: &mut usize,
) -> Result<FileNode, AppError> {
    *count += 1;
    if *count > MAX_ENTRIES || depth > MAX_DEPTH {
        return Ok(empty_dir(name, rel));
    }
    let entries = match std::fs::read_dir(abs) {
        Ok(r) => r,
        Err(_) => return Ok(empty_dir(name, rel)),
    };

    let mut dirs: Vec<FileNode> = Vec::new();
    let mut files: Vec<(String, String)> = Vec::new();

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let Ok(file_type) = entry.file_type() else { continue };
        // I symlink vengono ignorati per evitare cicli e fughe dalla sandbox.
        if file_type.is_symlink() {
            continue;
        }
        let entry_name = entry.file_name().to_string_lossy().to_string();
        let child_rel = if rel.is_empty() {
            entry_name.clone()
        } else {
            format!("{rel}/{}", entry_name)
        };
        if file_type.is_dir() {
            if SKIP_DIRS.contains(&entry_name.as_str()) || child_rel == out_rel {
                continue;
            }
            dirs.push(walk(
                &entry.path(),
                &child_rel,
                &entry_name,
                depth + 1,
                out_rel,
                count,
            )?);
        } else {
            files.push((entry_name, child_rel));
        }
    }

    dirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    files.sort_by(|a, b| a.0.to_lowercase().cmp(&b.0.to_lowercase()));

    let mut children = dirs;
    children.extend(files.into_iter().map(|(n, p)| FileNode {
        name: n,
        path: p,
        kind: "file".to_string(),
        children: None,
    }));

    Ok(FileNode {
        name: name.to_string(),
        path: rel.to_string(),
        kind: "dir".to_string(),
        children: Some(children),
    })
}

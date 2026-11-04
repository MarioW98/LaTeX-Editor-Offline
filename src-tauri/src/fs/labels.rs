//! Raccolta di etichette (`\label{...}`), voci bibliografiche (`.bib`) e
//! `\bibitem{...}` nel progetto: serve a completamento e navigazione
//! `\ref`/`\cite` nel frontend.

use std::path::Path;

use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LabelEntry {
    pub name: String,
    pub file: String,
    pub line: u32,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BibEntry {
    pub key: String,
    pub file: String,
    pub line: u32,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct LabelsIndex {
    pub labels: Vec<LabelEntry>,
    pub bib_keys: Vec<BibEntry>,
}

const MAX_ENTRIES: usize = 5000;
const MAX_FILE_BYTES: u64 = 4 * 1024 * 1024;

pub fn collect(root: &Path, out_dir_rel: &str) -> LabelsIndex {
    let mut index = LabelsIndex::default();
    let mut files: Vec<(std::path::PathBuf, String)> = Vec::new();
    walk_files(root, "", out_dir_rel, &mut files, 0);
    for (abs, rel) in files {
        let ext = abs
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        let is_tex = matches!(ext.as_str(), "tex" | "sty" | "cls");
        let is_bib = ext == "bib";
        if !is_tex && !is_bib {
            continue;
        }
        let Ok(meta) = std::fs::metadata(&abs) else { continue };
        if meta.len() > MAX_FILE_BYTES {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(&abs) else { continue };
        for (i, line) in text.lines().enumerate() {
            let line_no = (i + 1) as u32;
            if is_tex {
                scan_all_occurrences(line, "\\label{", |name| {
                    if index.labels.len() < MAX_ENTRIES {
                        index.labels.push(LabelEntry {
                            name: name.to_string(),
                            file: rel.clone(),
                            line: line_no,
                        });
                    }
                });
                scan_all_occurrences(line, "\\bibitem{", |key| {
                    if index.bib_keys.len() < MAX_ENTRIES {
                        index.bib_keys.push(BibEntry {
                            key: key.to_string(),
                            file: rel.clone(),
                            line: line_no,
                        });
                    }
                });
            } else {
                scan_bib_entry(line, |key| {
                    if index.bib_keys.len() < MAX_ENTRIES {
                        index.bib_keys.push(BibEntry {
                            key: key.to_string(),
                            file: rel.clone(),
                            line: line_no,
                        });
                    }
                });
            }
        }
    }
    index
}

/// Cerca più occorrenze di `prefix{...}` nella riga e passa il contenuto delle
/// graffe al callback.
fn scan_all_occurrences(line: &str, prefix: &str, mut cb: impl FnMut(&str)) {
    let mut from = 0usize;
    while let Some(pos) = line[from..].find(prefix) {
        let start = from + pos + prefix.len();
        if let Some(end_rel) = line[start..].find('}') {
            let end = start + end_rel;
            let inner = &line[start..end];
            if !inner.is_empty() && !inner.contains('{') {
                cb(inner);
            }
            from = end + 1;
        } else {
            break;
        }
    }
}

/// Riga di un `.bib` nel formato `@tipo{chiave,` (con eventuale spazio).
fn scan_bib_entry(line: &str, mut cb: impl FnMut(&str)) {
    let trimmed = line.trim_start();
    if !trimmed.starts_with('@') {
        return;
    }
    let Some(brace) = trimmed.find('{') else { return };
    let at_type = &trimmed[1..brace];
    if at_type.is_empty() || !at_type.chars().all(|c| c.is_ascii_alphanumeric()) {
        return;
    }
    let rest = &trimmed[brace + 1..];
    let key_end = rest
        .find(|c: char| c == ',' || c == '}' || c.is_whitespace())
        .unwrap_or(rest.len());
    let key = &rest[..key_end];
    if !key.is_empty() && key.chars().all(|c| !c.is_whitespace() && c != '{' && c != '}') {
        cb(key);
    }
}

fn walk_files(
    abs: &Path,
    rel: &str,
    out_rel: &str,
    out: &mut Vec<(std::path::PathBuf, String)>,
    depth: usize,
) {
    if depth > 16 || out.len() > MAX_ENTRIES {
        return;
    }
    let Ok(entries) = std::fs::read_dir(abs) else { return };
    for entry in entries.flatten() {
        let Ok(ft) = entry.file_type() else { continue };
        if ft.is_symlink() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let child_rel = if rel.is_empty() {
            name.clone()
        } else {
            format!("{rel}/{name}")
        };
        if ft.is_dir() {
            if name == ".git" || name == "node_modules" || child_rel == out_rel {
                continue;
            }
            walk_files(&entry.path(), &child_rel, out_rel, out, depth + 1);
        } else {
            out.push((entry.path(), child_rel));
        }
    }
}

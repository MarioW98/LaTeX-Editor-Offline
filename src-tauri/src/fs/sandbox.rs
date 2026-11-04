//! Sandbox dei percorsi: tutte le operazioni su file richieste dal frontend
//! devono restare confinate nella cartella progetto aperta.
//!
//! Questo modulo è volontariamente privo di dipendenze da Tauri (logica pura,
//! facilmente verificabile): i comandi lo usano e mappano `SandboxError`
//! in `AppError`.

use std::path::{Component, Path, PathBuf};

#[derive(Debug, PartialEq, Eq)]
pub enum SandboxError {
    /// Il percorso relativo contiene `..` o componenti sospetti.
    Escape(String),
    /// Era atteso un percorso relativo, ma è arrivato un assoluto.
    Absolute(String),
    /// Il percorso canonico risolve fuori dalla radice progetto.
    OutsideRoot(String),
}

impl std::fmt::Display for SandboxError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SandboxError::Escape(p) => write!(f, "percorso relativo non valido: {p}"),
            SandboxError::Absolute(p) => write!(f, "atteso percorso relativo: {p}"),
            SandboxError::OutsideRoot(p) => write!(f, "percorso fuori dalla radice progetto: {p}"),
        }
    }
}

impl std::error::Error for SandboxError {}

/// Rimuove il prefisso `\\?\` restituito da `canonicalize` su Windows
/// per mantenere percorsi confrontabili e leggibili.
pub fn normalize(p: &Path) -> PathBuf {
    let s = p.to_string_lossy();
    #[cfg(windows)]
    {
        if let Some(stripped) = s.strip_prefix(r"\\?\") {
            return PathBuf::from(stripped);
        }
    }
    #[cfg(not(windows))]
    let _ = s;
    p.to_path_buf()
}

/// Canonicalizza il percorso; se non esiste ancora (es. file da creare),
/// canonicalizza l'antenato più vicino e riaggiunge la parte mancante.
pub fn canonical_existing(p: &Path) -> PathBuf {
    if let Ok(c) = std::fs::canonicalize(p) {
        return normalize(&c);
    }
    let mut ancestor = p.to_path_buf();
    let mut tail: Vec<std::ffi::OsString> = Vec::new();
    while !ancestor.exists() {
        match ancestor.file_name().map(|n| n.to_os_string()) {
            Some(name) => tail.push(name),
            None => break,
        }
        match ancestor.parent() {
            Some(parent) => ancestor = parent.to_path_buf(),
            None => break,
        }
    }
    let base = std::fs::canonicalize(&ancestor)
        .map(|c| normalize(&c))
        .unwrap_or(ancestor);
    let mut out = base;
    for part in tail.iter().rev() {
        out.push(part);
    }
    out
}

/// Verifica che `target` (già unito alla radice) risolva dentro `root`.
/// Ritorna la forma canonica del percorso.
pub fn ensure_within(root: &Path, target: &Path) -> Result<PathBuf, SandboxError> {
    let canon = canonical_existing(target);
    if canon.starts_with(root) {
        Ok(canon)
    } else {
        Err(SandboxError::OutsideRoot(target.display().to_string()))
    }
}

/// Risolve un percorso relativo (con separatori `/`) dentro la radice progetto,
/// rifiutando componenti `..` e percorsi assoluti.
pub fn resolve_in_root(root: &Path, rel: &str) -> Result<PathBuf, SandboxError> {
    let rel_path = Path::new(rel);
    if rel_path.is_absolute() {
        return Err(SandboxError::Absolute(rel.to_string()));
    }
    for comp in rel_path.components() {
        if let Component::ParentDir = comp {
            return Err(SandboxError::Escape(rel.to_string()));
        }
    }
    let target = root.join(rel_path);
    ensure_within(root, &target)
}

/// Converte un percorso in forma relativa con separatori `/`, se dentro `root`.
pub fn to_rel(root: &Path, abs: &Path) -> Option<String> {
    let rel = abs.strip_prefix(root).ok()?;
    let s = rel.to_string_lossy().replace('\\', "/");
    Some(s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_rifiuta_parent_dir() {
        let root = Path::new("/tmp/progetto");
        assert!(matches!(
            resolve_in_root(root, "../fuori.txt"),
            Err(SandboxError::Escape(_))
        ));
    }

    #[test]
    fn resolve_rifiuta_assoluti() {
        let root = Path::new("/tmp/progetto");
        assert!(matches!(
            resolve_in_root(root, "/etc/passwd"),
            Err(SandboxError::Absolute(_))
        ));
    }

    #[test]
    fn to_rel_normale() {
        let root = Path::new("/tmp/progetto");
        assert_eq!(to_rel(root, &root.join("a/b.tex")).as_deref(), Some("a/b.tex"));
    }
}

//! Classification and safe reading of files opened in the editor.
//!
//! A file is editable only if it is valid UTF-8 **and** contains no NUL
//! bytes. Anything else (binary files, Latin-1/CP1252 text, …) is reported
//! as non-modifiable (`binary == true`) and its bytes are never decoded
//! lossily: this guarantees that no content with replacement characters
//! (U+FFFD) can ever reach the editor buffer and be written back to disk
//! by the autosave.
//!
//! Files larger than [`MAX_EDITABLE_BYTES`] are refused with an explicit
//! error BEFORE being read: loading hundreds of MB into a string and
//! shipping them through IPC would freeze the app.
//!
//! This module is intentionally free of Tauri dependencies so the
//! classification and the read path can be unit-tested standalone
//! (`cargo test`).

use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::path::Path;

/// Maximum size of a file the editor is willing to open. Anything larger
/// is refused with an explicit error instead of being loaded.
const MAX_EDITABLE_BYTES: u64 = 8 * 1024 * 1024;

/// Payload of the `read_file` IPC command.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub content: String,
    pub size: u64,
    /// `true` = non modificabile (file binario oppure testo non UTF-8):
    /// l'editor lo apre in sola lettura e l'autosave non lo riscrive mai.
    pub binary: bool,
}

/// Editable text: valid UTF-8 without NUL bytes. Returns `None` for any
/// input that must not round-trip through the editor (NUL byte anywhere in
/// the file, or invalid UTF-8 anywhere in the file).
pub fn as_editable_text(bytes: &[u8]) -> Option<&str> {
    if bytes.contains(&0) {
        return None;
    }
    std::str::from_utf8(bytes).ok()
}

/// Explicit refusal for oversized files: the size is reported in MB and
/// the 8 MiB limit is stated, so the user knows why nothing opened.
fn too_large(size: u64) -> AppError {
    let mb = size as f64 / (1024.0 * 1024.0);
    AppError::Plain(format!(
        "file troppo grande per l'editor ({mb:.1} MB): massimo 8 MiB"
    ))
}

/// Read a file for the editor. On success `binary == false` and `content`
/// is the exact file text. When the file is not safely editable the
/// content is empty and `binary == true`: lossy text is never produced.
///
/// Files over 8 MiB are refused with an explicit error, checked on the
/// metadata BEFORE reading (and re-checked on the bytes actually read, in
/// case the file grew in between): no silent partial load ever happens.
pub fn read_file_content(path: &Path) -> AppResult<FileContent> {
    let size_on_disk = std::fs::metadata(path)?.len();
    if size_on_disk > MAX_EDITABLE_BYTES {
        return Err(too_large(size_on_disk));
    }
    let bytes = std::fs::read(path)?;
    let size = bytes.len() as u64;
    if size > MAX_EDITABLE_BYTES {
        return Err(too_large(size));
    }
    Ok(match as_editable_text(&bytes) {
        Some(text) => FileContent {
            content: text.to_string(),
            size,
            binary: false,
        },
        None => FileContent {
            content: String::new(),
            size,
            binary: true,
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn invalid_utf8_is_reported_not_editable_without_lossy_content() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("latin1.tex");
        // "a à b" codificato in Latin-1: il byte 0xE0 non è UTF-8 valido.
        let bytes: [u8; 4] = [0x61, 0xE0, 0x20, 0x62];
        fs::write(&p, bytes).unwrap();

        let fc = read_file_content(&p).unwrap();
        assert!(
            fc.binary,
            "un file con byte 0xE0 non UTF-8 deve essere segnalato non modificabile"
        );
        assert!(
            fc.content.is_empty(),
            "read_file non deve restituire contenuto lossy, ha restituito: {:?}",
            fc.content
        );
        assert_eq!(fc.size, 4);
    }

    #[test]
    fn nul_byte_anywhere_is_not_editable() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("blob.bin");
        // NUL oltre i primi 8192 byte: la vecchia rilevazione lo saltava.
        let mut bytes = vec![0x41u8; 9000];
        bytes.push(0x00);
        fs::write(&p, &bytes).unwrap();

        let fc = read_file_content(&p).unwrap();
        assert!(fc.binary, "un file con NUL deve restare non modificabile");
        assert!(fc.content.is_empty());
        assert_eq!(fc.size, 9001);
    }

    #[test]
    fn valid_utf8_text_stays_editable_and_exact() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("main.tex");
        let text = "\\documentclass{article}\n% città àèù — testo\n";
        fs::write(&p, text).unwrap();

        let fc = read_file_content(&p).unwrap();
        assert!(!fc.binary, "un file UTF-8 valido deve restare modificabile");
        assert_eq!(fc.content, text);
        assert_eq!(fc.size, text.len() as u64);
    }

    // B0.4 — cap dimensione: un file oltre 8 MiB non deve MAI essere
    // caricato in memoria (e spedito via IPC): errore esplicito.
    #[test]
    fn oversized_file_is_rejected_with_explicit_error() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("enorme.tex");
        let bytes = vec![b'a'; 9 * 1024 * 1024];
        fs::write(&p, &bytes).unwrap();

        let res = read_file_content(&p);
        let err = res
            .err()
            .expect("un file da 9 MiB deve essere rifiutato, non caricato");
        assert!(
            err.to_string().contains("troppo grande"),
            "l'errore deve essere esplicito sulla dimensione, invece: {err}"
        );
        assert!(
            err.to_string().contains("8 MiB"),
            "l'errore deve dichiarare il massimo, invece: {err}"
        );
    }

    // B0.4 — il confine è "oltre 8 MiB": 8 MiB + 1 byte è già troppo.
    #[test]
    fn one_byte_over_the_cap_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("al_limite.tex");
        let bytes = vec![b'a'; (8 * 1024 * 1024 + 1) as usize];
        fs::write(&p, &bytes).unwrap();

        assert!(
            read_file_content(&p).is_err(),
            "8 MiB + 1 byte deve essere rifiutato"
        );
    }

    // B0.4 — un file normale da 1 MiB resta leggibile integralmente.
    #[test]
    fn one_mib_file_stays_fully_readable() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("normale.tex");
        let bytes = vec![b'x'; 1024 * 1024];
        fs::write(&p, &bytes).unwrap();

        let fc = read_file_content(&p).unwrap();
        assert!(!fc.binary);
        assert_eq!(fc.content.len(), 1024 * 1024);
        assert_eq!(fc.size, (1024 * 1024) as u64);
    }
}

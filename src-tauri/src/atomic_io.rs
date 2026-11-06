//! Atomic file replacement used by `write_file` (and therefore by the
//! autosave, the riskiest write path of the app).
//!
//! The content is written to a temporary file created in the SAME directory
//! as the destination, flushed and fsynced, and is then renamed over the
//! destination in a single atomic step (`NamedTempFile::persist`; on
//! Windows that is `MoveFileEx` with `MOVEFILE_REPLACE_EXISTING`). A crash
//! mid-write can no longer truncate or corrupt the original file.
//!
//! On any error the original file is left intact and no temporary file is
//! left behind (`NamedTempFile` removes itself on drop, including on
//! `persist` failures).
//!
//! This module is intentionally free of Tauri dependencies so the write
//! path can be unit-tested standalone (`cargo test`).

use std::io::Write;
use std::path::Path;
use tempfile::NamedTempFile;

/// Atomically replace the file at `path` with `content`.
pub fn write_atomic(path: &Path, content: &[u8]) -> std::io::Result<()> {
    let dir = match path.parent() {
        Some(p) if !p.as_os_str().is_empty() => p,
        _ => Path::new("."),
    };
    // Same directory as the target: the final rename stays on one
    // filesystem, which is what makes it atomic.
    std::fs::create_dir_all(dir)?;
    let mut tmp = NamedTempFile::new_in(dir)?;
    tmp.write_all(content)?;
    // Flush the OS buffers before the rename: after persist() the content
    // must already be durable, not "on its way" to the disk.
    tmp.as_file().sync_all()?;
    tmp.persist(path).map_err(|e| e.error)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Read;

    #[test]
    #[cfg(unix)]
    fn rename_semantics_open_handle_still_reads_old_content() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("f.tex");
        fs::write(&p, b"OLD").unwrap();
        // Handle di lettura aperto PRIMA della scrittura: con un rename
        // atomico continua a leggere il vecchio inode fino a EOF.
        let mut handle = fs::File::open(&p).unwrap();

        write_atomic(&p, b"NEW").unwrap();

        let mut seen = String::new();
        handle.read_to_string(&mut seen).unwrap();
        assert_eq!(
            seen, "OLD",
            "l'handle di lettura vede il contenuto riscritto/troncato: scrittura in place, non atomica"
        );
        assert_eq!(fs::read(&p).unwrap(), b"NEW");
    }

    #[test]
    fn no_temporary_residue_after_success() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("f.tex");
        write_atomic(&p, b"nuovo contenuto").unwrap();
        let mut names: Vec<String> = fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        assert_eq!(names, vec!["f.tex".to_string()]);
    }

    #[test]
    #[cfg(unix)]
    fn failed_write_leaves_original_intact_and_no_residue() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let sub = dir.path().join("ro");
        fs::create_dir_all(&sub).unwrap();
        let p = sub.join("originale.tex");
        fs::write(&p, b"CONTENUTO ORIGINALE").unwrap();

        // Directory non scrivibile: creare il temporaneo deve fallire.
        let mut perms = fs::metadata(&sub).unwrap().permissions();
        perms.set_mode(0o555);
        fs::set_permissions(&sub, perms).unwrap();

        // Se i permessi non sono applicati (utente root) il test non è
        // significativo in questo ambiente: salta senza falsare il verde.
        if fs::File::create(sub.join(".probe")).is_ok() {
            let mut perms = fs::metadata(&sub).unwrap().permissions();
            perms.set_mode(0o755);
            fs::set_permissions(&sub, perms).unwrap();
            let _ = fs::remove_file(sub.join(".probe"));
            eprintln!("permessi non applicati (root?): test saltato");
            return;
        }

        let result = write_atomic(&p, b"SOPRASCRITTO");

        let mut perms = fs::metadata(&sub).unwrap().permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&sub, perms).unwrap();

        assert!(
            result.is_err(),
            "la scrittura in una directory non scrivibile doveva fallire"
        );
        assert_eq!(
            fs::read(&p).unwrap(),
            b"CONTENUTO ORIGINALE",
            "una scrittura fallita ha rovinato il file originale"
        );
        let names: Vec<String> = fs::read_dir(&sub)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(
            names,
            vec!["originale.tex".to_string()],
            "residuo temporaneo dopo una scrittura fallita"
        );
    }
}

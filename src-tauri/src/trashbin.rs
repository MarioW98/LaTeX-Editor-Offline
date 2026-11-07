//! Protection against permanent deletion: everything the user deletes goes
//! to the system trash.
//!
//! If the trash is unavailable the operation fails with an explicit error
//! and the item stays on disk. There is deliberately NO fallback to a
//! permanent deletion: a deleted folder must always be recoverable.
//!
//! This module is intentionally free of Tauri dependencies so the trash
//! path can be unit-tested standalone (`cargo test`).

use std::path::Path;

/// Move `path` (file or directory) to the system trash.
/// On failure the item is still on disk and the error is reported.
pub fn move_to_trash(path: &Path) -> Result<(), String> {
    trash::delete(path).map_err(|e| {
        format!("impossibile spostare nel cestino: {e}. L'elemento NON è stato eliminato.")
    })
}

#[cfg(test)]
mod tests {
    // Contratto di determinismo CI (M0.6.3): il comportamento del cestino
    // di sistema è deterministico nei runner CI SOLO su Linux — il cestino
    // è disponibile di norma e XDG_DATA_HOME ne forza l'indisponibilità
    // (implementazione freedesktop). Sui runner Windows/macOS headless la
    // disponibilità del cestino non è garantita: lì questi test sono
    // compilati fuori e il contratto è verificato dove è deterministico.
    // Import e lock dell'ambiente seguono lo stesso gate: senza di esso i
    // test compilati fuori lascerebbero elementi non usati, rompendo
    // `cargo clippy --all-targets -- -D warnings` sugli altri OS.
    #[cfg(target_os = "linux")]
    use super::*;
    #[cfg(target_os = "linux")]
    use std::fs;
    #[cfg(target_os = "linux")]
    use std::sync::Mutex;

    /// Serializza i test che toccano l'ambiente di processo.
    #[cfg(target_os = "linux")]
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    #[cfg(target_os = "linux")]
    #[test]
    fn delete_moves_file_to_trash_and_off_disk() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("capitolo.tex");
        fs::write(&p, b"contenuto").unwrap();

        let result = move_to_trash(&p);

        assert!(
            result.is_ok(),
            "il cestino deve essere disponibile: {:?}",
            result.err()
        );
        assert!(
            !p.exists(),
            "il file spostato nel cestino esiste ancora sul disco"
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn when_trash_is_unavailable_the_item_must_survive() {
        let _guard = ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("capitolo.tex");
        fs::write(&p, b"importante").unwrap();

        // Cestino reso non disponibile: XDG_DATA_HOME punta dentro un
        // percorso non creabile (ENOTDIR), quindi l'implementazione
        // freedesktop non può creare/usare la directory Trash.
        let saved_xdg = std::env::var_os("XDG_DATA_HOME");
        std::env::set_var("XDG_DATA_HOME", "/dev/null/cestino-impossibile");
        let result = move_to_trash(&p);
        match saved_xdg {
            Some(v) => std::env::set_var("XDG_DATA_HOME", v),
            None => std::env::remove_var("XDG_DATA_HOME"),
        }

        assert!(
            result.is_err(),
            "con il cestino non disponibile l'operazione deve fallire in modo esplicito"
        );
        assert!(
            p.exists(),
            "il file è stato eliminato permanentemente nonostante il fallimento del cestino"
        );
    }
}

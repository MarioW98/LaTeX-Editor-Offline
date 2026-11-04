//! Stato globale dell'applicazione gestito da Tauri.

use std::path::PathBuf;
use std::process::Child;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use crate::error::AppError;

/// Stato della pipeline di build: id progressivo, flag di esecuzione,
/// richiesta di annullamento e handle del processo figlio corrente.
pub struct BuildState {
    id: AtomicU64,
    running: AtomicBool,
    /// Flag impostato dal comando `cancel_build`.
    pub cancel: Arc<AtomicBool>,
    /// Processo figlio corrente (protetto da mutex per consentire il kill da un altro thread).
    pub child: Arc<Mutex<Option<Child>>>,
    last_pdf: Mutex<Option<PathBuf>>,
}

impl BuildState {
    pub fn new() -> Self {
        Self {
            id: AtomicU64::new(0),
            running: AtomicBool::new(false),
            cancel: Arc::new(AtomicBool::new(false)),
            child: Arc::new(Mutex::new(None)),
            last_pdf: Mutex::new(None),
        }
    }

    pub fn next_id(&self) -> u64 {
        self.id.fetch_add(1, Ordering::SeqCst) + 1
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    /// Imposta `running` da false a true; ritorna false se una build è già attiva.
    pub fn claim_start(&self) -> bool {
        self.running
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
    }

    /// Da chiamare alla fine della pipeline (sempre, anche in caso di errore).
    pub fn finish(&self) {
        self.running.store(false, Ordering::SeqCst);
    }

    pub fn set_last_pdf(&self, pdf: Option<PathBuf>) {
        *self.last_pdf.lock().unwrap() = pdf;
    }

    #[allow(dead_code)]
    pub fn last_pdf(&self) -> Option<PathBuf> {
        self.last_pdf.lock().unwrap().clone()
    }
}

/// Stato complessivo: cartella progetto aperta (radice canonica) + stato build.
pub struct AppState {
    pub project: Mutex<Option<PathBuf>>,
    pub build: Arc<BuildState>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            project: Mutex::new(None),
            build: Arc::new(BuildState::new()),
        }
    }

    pub fn root(&self) -> Result<PathBuf, AppError> {
        self.project
            .lock()
            .unwrap()
            .clone()
            .ok_or(AppError::NoProject)
    }

    pub fn set_root(&self, root: Option<PathBuf>) {
        *self.project.lock().unwrap() = root;
    }
}

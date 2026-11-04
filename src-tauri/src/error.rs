//! Errori applicativi condivisi tra i comandi Tauri.
//!
//! Ogni variante viene serializzata come oggetto `{ code, message }` in modo
//! che il frontend riceva sempre un errore strutturato e mostrabile.

use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("nessun progetto aperto")]
    NoProject,

    #[error("percorso fuori dai limiti del progetto: {0}")]
    Outside(String),

    #[error("percorso non valido: {0}")]
    InvalidPath(String),

    #[error("elemento non trovato: {0}")]
    NotFound(String),

    #[error("elemento già esistente: {0}")]
    Exists(String),

    #[error("una build è già in corso")]
    BuildRunning,

    #[error("impostazione non valida: {0}")]
    Invalid(String),

    #[error("errore di I/O: {0}")]
    Io(#[from] std::io::Error),

    #[error("errore JSON: {0}")]
    Json(#[from] serde_json::Error),
}

impl AppError {
    fn code(&self) -> &'static str {
        match self {
            AppError::NoProject => "no_project",
            AppError::Outside(_) => "outside_project",
            AppError::InvalidPath(_) => "invalid_path",
            AppError::NotFound(_) => "not_found",
            AppError::Exists(_) => "exists",
            AppError::BuildRunning => "build_running",
            AppError::Invalid(_) => "invalid",
            AppError::Io(_) => "io",
            AppError::Json(_) => "json",
        }
    }
}

impl From<crate::fs::sandbox::SandboxError> for AppError {
    fn from(e: crate::fs::sandbox::SandboxError) -> Self {
        match e {
            crate::fs::sandbox::SandboxError::Escape(p) => AppError::Outside(p),
            crate::fs::sandbox::SandboxError::Absolute(p) => AppError::InvalidPath(p),
            crate::fs::sandbox::SandboxError::OutsideRoot(p) => AppError::Outside(p),
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct Encoded<'a> {
            code: &'a str,
            message: String,
        }
        serializer.serialize_some(&Encoded {
            code: self.code(),
            message: self.to_string(),
        })
    }
}

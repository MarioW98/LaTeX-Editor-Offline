//! Application error type.
//!
//! Tauri commands return `AppResult<T>`; the error is serialized as a plain
//! string so the frontend always receives a readable message in Italian.

use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Errore di I/O: {0}")]
    Io(#[from] std::io::Error),

    #[error("Il percorso è fuori dalla cartella del progetto: {0}")]
    OutsideProject(String),

    #[error("Percorso non valido: {0}")]
    InvalidPath(String),

    #[error("Non trovato: {0}")]
    NotFound(String),

    #[error("JSON non valido: {0}")]
    Json(#[from] serde_json::Error),

    #[error("{0}")]
    Message(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    /// Convenience constructor for plain user-facing messages.
    pub fn msg(text: impl Into<String>) -> Self {
        AppError::Message(text.into())
    }
}

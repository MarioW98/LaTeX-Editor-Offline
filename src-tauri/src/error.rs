use serde::{ser::Serializer, Serialize};

use crate::toolchain::ToolchainProblem;

/// Errore dei comandi Tauri. Sul filo della IPC è SEMPRE una stringa (il
/// messaggio pronto per l'utente), ma il tipo interno distingue l'origine:
/// la variante [`AppError::Toolchain`] è l'esito tipizzato del gate sulla
/// compilazione (M0.7.1) — la webview la riconosce dal messaggio deciso e
/// apre il dialog di guida invece di incollare la stringa nel log.
#[derive(Debug)]
pub enum AppError {
    /// Messaggio pronto per l'utente, così com'è.
    Plain(String),
    /// La compilazione non può partire: la rilevazione strumenti ha deciso
    /// che il toolchain non c'è (vedi `toolchain::choose_build_driver`).
    /// Il messaggio è quello azionabile di `ToolchainProblem::user_message`.
    Toolchain(ToolchainProblem),
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppError::Plain(s) => write!(f, "{s}"),
            AppError::Toolchain(p) => write!(f, "{}", p.user_message()),
        }
    }
}

impl std::error::Error for AppError {}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Plain(e.to_string())
    }
}

impl From<std::env::JoinPathsError> for AppError {
    fn from(e: std::env::JoinPathsError) -> Self {
        AppError::Plain(e.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::Plain(e.to_string())
    }
}

impl From<tauri::Error> for AppError {
    fn from(e: tauri::Error) -> Self {
        AppError::Plain(e.to_string())
    }
}

impl From<ToolchainProblem> for AppError {
    fn from(p: ToolchainProblem) -> Self {
        AppError::Toolchain(p)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Il filo della IPC è il messaggio deciso: il frontend lo riconosce e
    /// apre il dialog di guida (vedi src/latex/latexStatusUi.ts).
    #[test]
    fn toolchain_variant_serializes_as_the_decided_user_message() {
        let e = AppError::from(ToolchainProblem::NoDistribution {
            missing: "pdflatex".into(),
        });
        assert_eq!(
            e.to_string(),
            "Nessuna distribuzione LaTeX trovata: per compilare serve MiKTeX o TeX Live \
             (vedi la sezione Requisiti del manuale). Dopo l'installazione riavvia l'app."
        );
        let e2 = AppError::from(ToolchainProblem::EngineMissing {
            missing: "xelatex".into(),
        });
        assert!(e2.to_string().starts_with("La distribuzione LaTeX installata non include il motore xelatex"));
        // la variante Plain resta se stessa
        assert_eq!(AppError::Plain("msg".into()).to_string(), "msg");
    }
}

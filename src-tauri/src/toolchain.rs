//! Scelta del motore di compilazione a partire dalla rilevazione strumenti,
//! estratta come logica pura (nessun processo, nessun Tauri) così la
//! decisione si testa deterministicamente con plain `cargo test`, allo
//! stesso modo di `build_slot`.
//!
//! Contratto (M0.7.1):
//! - `choose_build_driver(detection, requested)` decide CHE COSA guida la
//!   compilazione prima di riservare lo slot e prima di qualunque spawn:
//!   - `latexmk` disponibile E motore richiesto disponibile →
//!     `BuildDriver::Latexmk { engine }` (latexmk guida il motore richiesto);
//!   - `latexmk` assente ma motore richiesto disponibile →
//!     `BuildDriver::Engine { engine }` (sequenza multi-passaggio propria);
//!   - motore richiesto assente ma qualcosa di compilabile presente
//!     (latexmk o un altro motore) → `ToolchainProblem::EngineMissing`:
//!     la distribuzione c'è, il motore specifico no — mai compilare di
//!     nascosto con un motore diverso da quello scelto dall'utente;
//!   - nulla di compilabile → `ToolchainProblem::NoDistribution`.
//! - `ToolchainProblem::user_message()` è il testo che arriva all'utente
//!   (via `AppError::Toolchain`): azionabile, in italiano, punta alla
//!   sezione Requisiti del manuale. Non è mai un errore `io` grezzo.

/// Disponibilità dei soli tool che decidono la compilazione.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct ToolDetection {
    pub latexmk: bool,
    pub pdflatex: bool,
    pub xelatex: bool,
    pub lualatex: bool,
}

impl ToolDetection {
    /// Marca `engine` come disponibile (i nomi non noti restano ignorati).
    pub fn with_engine(mut self, engine: &str, available: bool) -> Self {
        match engine {
            "latexmk" => self.latexmk = available,
            "pdflatex" => self.pdflatex = available,
            "xelatex" => self.xelatex = available,
            "lualatex" => self.lualatex = available,
            _ => {}
        }
        self
    }

    /// Disponibilità del motore dato (false per nomi non noti).
    pub fn engine_available(&self, engine: &str) -> bool {
        match engine {
            "latexmk" => self.latexmk,
            "pdflatex" => self.pdflatex,
            "xelatex" => self.xelatex,
            "lualatex" => self.lualatex,
            _ => false,
        }
    }

    /// C'è almeno un motore con cui compilare.
    pub fn any_engine(&self) -> bool {
        self.pdflatex || self.xelatex || self.lualatex
    }
}

/// Il programma che guida la compilazione, deciso PRIMA di ogni spawn.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BuildDriver {
    /// `latexmk` guida la compilazione del motore richiesto.
    Latexmk { engine: String },
    /// Il motore gira direttamente: sequenza multi-passaggio propria.
    Engine { engine: String },
}

/// Perché la compilazione non può partire: la decisione sulla rilevazione
/// strumenti è negativa. L'esito è TIPIZZATO, non una stringa `io` grezza.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ToolchainProblem {
    /// Nessuna distribuzione LaTeX: né latexmk né alcun motore.
    NoDistribution {
        /// Il motore che sarebbe servito, per il log e i test.
        missing: String,
    },
    /// Distribuzione presente, ma il motore richiesto non c'è.
    EngineMissing {
        /// Il motore mancante, finito nel messaggio all'utente.
        missing: String,
    },
}

impl ToolchainProblem {
    /// Il messaggio per l'utente: azionabile, punta ai Requisiti del
    /// manuale. `AppError::Toolchain` lo mette in fila verso la webview.
    pub fn user_message(&self) -> String {
        match self {
            ToolchainProblem::NoDistribution { .. } => {
                "Nessuna distribuzione LaTeX trovata: per compilare serve MiKTeX o TeX Live \
                 (vedi la sezione Requisiti del manuale). Dopo l'installazione riavvia l'app."
                    .into()
            }
            ToolchainProblem::EngineMissing { missing } => format!(
                "La distribuzione LaTeX installata non include il motore {missing}: scegline un \
                 altro disponibile (l'elenco degli strumenti è nella barra di stato, alla voce \
                 «LaTeX») oppure installa il pacchetto corrispondente (vedi la sezione Requisiti \
                 del manuale)."
            ),
        }
    }
}

/// Decisione pura sul driver di compilazione (vedi il contratto del modulo).
pub fn choose_build_driver(
    detection: &ToolDetection,
    requested_engine: &str,
) -> Result<BuildDriver, ToolchainProblem> {
    if !detection.engine_available(requested_engine) {
        // Il motore richiesto manca: distribuzione presente (c'è latexmk o
        // un altro motore) o del tutto assente — mai compilare di nascosto
        // con un motore diverso da quello scelto dall'utente.
        return Err(if detection.any_engine() || detection.latexmk {
            ToolchainProblem::EngineMissing {
                missing: requested_engine.into(),
            }
        } else {
            ToolchainProblem::NoDistribution {
                missing: requested_engine.into(),
            }
        });
    }
    if detection.latexmk {
        Ok(BuildDriver::Latexmk {
            engine: requested_engine.into(),
        })
    } else {
        Ok(BuildDriver::Engine {
            engine: requested_engine.into(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn det(latexmk: bool, pdflatex: bool, xelatex: bool, lualatex: bool) -> ToolDetection {
        ToolDetection {
            latexmk,
            pdflatex,
            xelatex,
            lualatex,
        }
    }

    // (a) rilevazione vuota → esito tipizzato «toolchain assente», con il
    // nome del motore mancante. Il flusso naive tentava lo spawn alla cieca
    // e restituiva l'errore io grezzo («program not found»).
    #[test]
    fn empty_detection_yields_typed_no_distribution_with_missing_engine() {
        let r = choose_build_driver(&det(false, false, false, false), "pdflatex");
        assert_eq!(
            r,
            Err(ToolchainProblem::NoDistribution {
                missing: "pdflatex".into()
            }),
            "la rilevazione vuota deve produrre l'esito TIPIZZATO, non uno spawn alla cieca"
        );
        let msg = r.unwrap_err().user_message();
        assert!(
            msg.starts_with("Nessuna distribuzione LaTeX trovata"),
            "il messaggio non è quello deciso: {msg}"
        );
        assert!(
            !msg.to_lowercase().contains("program not found"),
            "all'utente arriva l'errore io grezzo dello spawn cieco: {msg}"
        );
    }

    // (b) con latexmk (e il motore richiesto) → latexmk guida la build.
    #[test]
    fn latexmk_available_drives_the_build() {
        assert_eq!(
            choose_build_driver(&det(true, true, false, false), "pdflatex"),
            Ok(BuildDriver::Latexmk {
                engine: "pdflatex".into()
            })
        );
        assert_eq!(
            choose_build_driver(&det(true, true, true, true), "xelatex"),
            Ok(BuildDriver::Latexmk {
                engine: "xelatex".into()
            })
        );
    }

    // (c) con solo pdflatex (niente latexmk) → il motore gira direttamente.
    #[test]
    fn only_pdflatex_runs_pdflatex_directly() {
        assert_eq!(
            choose_build_driver(&det(false, true, false, false), "pdflatex"),
            Ok(BuildDriver::Engine {
                engine: "pdflatex".into()
            })
        );
    }

    // (d) distribuzione presente ma motore richiesto mancante → esito
    // tipizzato distinto, NON una scelta silenziosa di un altro motore.
    #[test]
    fn distribution_present_but_requested_engine_missing_is_typed_error() {
        // latexmk c'è, il motore richiesto no.
        assert_eq!(
            choose_build_driver(&det(true, true, false, false), "xelatex"),
            Err(ToolchainProblem::EngineMissing {
                missing: "xelatex".into()
            })
        );
        // solo pdflatex, il richiesto è xelatex.
        let r = choose_build_driver(&det(false, true, false, false), "xelatex");
        assert_eq!(
            r,
            Err(ToolchainProblem::EngineMissing {
                missing: "xelatex".into()
            })
        );
        let msg = r.unwrap_err().user_message();
        assert!(
            msg.contains("non include il motore xelatex"),
            "il messaggio deve nominare il motore mancante: {msg}"
        );
    }

    // (e) i due messaggi all'utente sono esattamente quelli decisi: sono il
    // contratto riconosciuto dal frontend per aprire il dialog di guida.
    #[test]
    fn user_messages_are_the_decided_contract() {
        assert_eq!(
            ToolchainProblem::NoDistribution {
                missing: "pdflatex".into()
            }
            .user_message(),
            "Nessuna distribuzione LaTeX trovata: per compilare serve MiKTeX o TeX Live \
             (vedi la sezione Requisiti del manuale). Dopo l'installazione riavvia l'app."
        );
        assert_eq!(
            ToolchainProblem::EngineMissing {
                missing: "xelatex".into()
            }
            .user_message(),
            "La distribuzione LaTeX installata non include il motore xelatex: scegline un \
             altro disponibile (l'elenco degli strumenti è nella barra di stato, alla voce \
             «LaTeX») oppure installa il pacchetto corrispondente (vedi la sezione Requisiti \
             del manuale)."
        );
    }

    // (f) ToolDetection: i nomi non noti non incidono sulla decisione.
    #[test]
    fn unknown_engine_names_are_ignored() {
        let d = ToolDetection::default().with_engine("pdflatex", true).with_engine("bibtex", true);
        assert!(d.engine_available("pdflatex"));
        assert!(!d.engine_available("bibtex"), "bibtex non decide la compilazione");
        assert!(!d.engine_available("gostscript"));
        assert!(d.any_engine());
        // latexmk contato correttamente
        let d2 = ToolDetection::default().with_engine("latexmk", true);
        assert!(d2.engine_available("latexmk"));
        assert!(!d2.any_engine(), "latexmk da solo non è un motore");
    }
}

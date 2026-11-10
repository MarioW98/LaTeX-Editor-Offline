//! Scelta del motore di compilazione e risoluzione degli strumenti a
//! partire dalla rilevazione, estratte come logica pura (nessun processo,
//! nessun Tauri; l'unico I/O è la lettura deterministica del filesystem per
//! le directory di TeX Live) così la decisione si testa deterministicamente
//! con plain `cargo test`, allo stesso modo di `build_slot`.
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
//!
//! Contratto (risoluzione oltre il PATH di processo):
//! - il probe sul PATH di processo può non bastare: il PATH dell'app può
//!   essere obsoleto o incompleto (cache ambiente di Explorer, contesto di
//!   lancio) mentre la distribuzione è regolarmente installata. Quando il
//!   PATH non raggiunge il tool, `candidate_dirs` elenca le directory
//!   standard delle distribuzioni e `resolve_tool` individua l'eseguibile
//!   nella prima directory che lo contiene. L'ORDINE è deterministico e le
//!   radici arrivano come parametri, così l'elenco si verifica su
//!   qualunque host di test;
//! - il percorso trovato finisce in `ToolPaths` e guida GLI SPAWN della
//!   build: `build_phases` produce i passi col percorso risolto, perché un
//!   tool trovato oltre il PATH ed eseguito col nome nudo fallirebbe
//!   comunque allo spawn.

use std::path::{Path, PathBuf};

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

/// Il sistema per cui costruire l'elenco delle directory candidate:
/// parametro esplicito così l'ordine è verificabile su qualunque host.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TargetOs {
    Windows,
    MacOS,
    Linux,
}

/// Il sistema corrente, per l'uso reale della risoluzione.
pub fn current_target_os() -> TargetOs {
    if cfg!(windows) {
        TargetOs::Windows
    } else if cfg!(target_os = "macos") {
        TargetOs::MacOS
    } else {
        TargetOs::Linux
    }
}

/// Directory standard delle distribuzioni LaTeX, in ordine di preferenza
/// deterministico. Pura rispetto alle radici: le directory utente arrivano
/// come parametri e TeX Live viene scandito solo quando `texlive_root` è
/// presente (su Windows è `C:\texlive`).
///
/// Windows: MiKTeX per-utente (LOCALAPPDATA), poi per-utente roaming
/// (APPDATA), poi l'installazione di sistema in Program Files, poi TeX Live
/// (anno più recente prima, `bin\windows` prima di `bin\win32`).
/// macOS: texbin di sistema, poi /usr/local/bin.
/// Linux: /usr/bin, poi /usr/local/bin.
pub fn candidate_dirs(
    os: TargetOs,
    localappdata: Option<&Path>,
    appdata: Option<&Path>,
    texlive_root: Option<&Path>,
) -> Vec<PathBuf> {
    let mut dirs = match os {
        TargetOs::Windows => {
            let mut v = Vec::new();
            if let Some(local) = localappdata {
                v.push(
                    local
                        .join("Programs")
                        .join("MiKTeX")
                        .join("miktex")
                        .join("bin")
                        .join("x64"),
                );
            }
            if let Some(roaming) = appdata {
                v.push(
                    roaming
                        .join("Programs")
                        .join("MiKTeX")
                        .join("miktex")
                        .join("bin")
                        .join("x64"),
                );
            }
            v.push(PathBuf::from(r"C:\Program Files\MiKTeX\miktex\bin\x64"));
            v
        }
        TargetOs::MacOS => vec![
            PathBuf::from("/Library/TeX/texbin"),
            PathBuf::from("/usr/local/bin"),
        ],
        TargetOs::Linux => vec![PathBuf::from("/usr/bin"), PathBuf::from("/usr/local/bin")],
    };
    if let Some(root) = texlive_root {
        dirs.extend(texlive_bin_dirs(root));
    }
    dirs
}

/// Le directory `bin` di TeX Live sotto `texlive_root` (es. `C:\texlive`):
/// un ramo per ogni versione installata, anno più recente prima, prima
/// tutte le `bin\windows` poi tutte le `bin\win32`. L'ordinamento per nome
/// decrescente è deterministico e per i nomi-anno coincide col più recente
/// prima.
fn texlive_bin_dirs(texlive_root: &Path) -> Vec<PathBuf> {
    let mut versions: Vec<String> = match std::fs::read_dir(texlive_root) {
        Ok(entries) => entries
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
            .filter_map(|e| e.file_name().into_string().ok())
            .collect(),
        Err(_) => Vec::new(),
    };
    versions.sort_unstable();
    versions.reverse();
    let mut dirs = Vec::new();
    for kind in ["windows", "win32"] {
        for version in &versions {
            let bin = texlive_root.join(version).join("bin").join(kind);
            if bin.is_dir() {
                dirs.push(bin);
            }
        }
    }
    dirs
}

/// Il suffisso dell'eseguibile sul sistema corrente.
pub fn exe_suffix() -> &'static str {
    if cfg!(windows) {
        ".exe"
    } else {
        ""
    }
}

/// Percorso completo dell'eseguibile cercandolo in `dirs` in ordine di
/// preferenza: vince la prima directory che lo contiene. `None` = il tool
/// non è presente in nessuna candidate dir.
pub fn resolve_tool(tool: &str, dirs: &[PathBuf]) -> Option<PathBuf> {
    resolve_tool_with_suffix(tool, dirs, exe_suffix())
}

/// Variante con suffisso esplicito: il ramo «name.exe» di Windows resta
/// verificabile da qualunque host di test.
pub fn resolve_tool_with_suffix(tool: &str, dirs: &[PathBuf], suffix: &str) -> Option<PathBuf> {
    for dir in dirs {
        let candidate = dir.join(format!("{tool}{suffix}"));
        if is_executable_file(&candidate) {
            return Some(candidate);
        }
    }
    None
}

/// Un file regolare eseguibile: su Unix conta il bit di esecuzione.
fn is_executable_file(path: &Path) -> bool {
    match std::fs::metadata(path) {
        Ok(meta) if meta.is_file() => {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                meta.permissions().mode() & 0o111 != 0
            }
            #[cfg(not(unix))]
            {
                true
            }
        }
        _ => false,
    }
}

/// Percorsi risolti degli strumenti che guidano la build: `Some` = il tool
/// non è raggiungibile dal PATH di processo e va eseguito col percorso
/// completo trovato nelle candidate dirs; `None` = il nome basta.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ToolPaths {
    pub latexmk: Option<String>,
    pub pdflatex: Option<String>,
    pub xelatex: Option<String>,
    pub lualatex: Option<String>,
}

impl ToolPaths {
    /// Il programma da passare allo spawn per `name`: il percorso risolto
    /// quando c'è, altrimenti il nome (raggiungibile dal PATH di processo).
    pub fn program(&self, name: &str) -> String {
        let resolved = match name {
            "latexmk" => self.latexmk.clone(),
            "pdflatex" => self.pdflatex.clone(),
            "xelatex" => self.xelatex.clone(),
            "lualatex" => self.lualatex.clone(),
            _ => None,
        };
        resolved.unwrap_or_else(|| name.to_string())
    }

    /// Registra il percorso risolto di un tool (None = il PATH basta).
    pub fn set_resolved(&mut self, name: &str, path: Option<String>) {
        match name {
            "latexmk" => self.latexmk = path,
            "pdflatex" => self.pdflatex = path,
            "xelatex" => self.xelatex = path,
            "lualatex" => self.lualatex = path,
            _ => {}
        }
    }
}

/// Un passo della build: programma (nome o percorso risolto) con argomenti
/// espliciti, oppure il motore con argomenti costruiti a runtime.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Step {
    Bib(String, Vec<String>),
    Engine(String),
}

/// I passi che la decisione del gate ha già determinato, con i programmi
/// presi dai percorsi risolti: un tool trovato oltre il PATH va eseguito
/// col percorso completo, perché col nome nudo lo spawn fallirebbe proprio
/// nel caso che la risoluzione ha risolto.
pub fn build_phases(
    latexmk_mode: bool,
    engine: &str,
    paths: &ToolPaths,
    latexmk_args: Vec<String>,
) -> Vec<Step> {
    if latexmk_mode {
        vec![Step::Bib(paths.program("latexmk"), latexmk_args)]
    } else {
        vec![Step::Engine(paths.program(engine))]
    }
}

/// Il passo bibliografico reso necessario dal primo passaggio, dai marker
/// nell'aux e dalla presenza del file .bcf: `\bibdata` chiede BibTeX,
/// altrimenti biblatex/biber (marker `\abx@aux` nell'aux o file .bcf).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BibNeed {
    Bibtex,
    Biber,
}

pub fn bib_need(aux_text: &str, bcf_exists: bool) -> Option<BibNeed> {
    if aux_text.contains("\\bibdata") {
        Some(BibNeed::Bibtex)
    } else if aux_text.contains("\\abx@aux") || bcf_exists {
        Some(BibNeed::Biber)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn det(latexmk: bool, pdflatex: bool, xelatex: bool, lualatex: bool) -> ToolDetection {
        ToolDetection {
            latexmk,
            pdflatex,
            xelatex,
            lualatex,
        }
    }

    // Directory temporanea unica per le fixture: pid + nanosecondi, così i
    // test in parallelo non si toccano.
    fn temp_root(tag: &str) -> PathBuf {
        let base = std::env::temp_dir().join(format!(
            "morsa-toolchain-{}-{}-{}",
            tag,
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .subsec_nanos()
        ));
        std::fs::create_dir_all(&base).unwrap();
        base
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

    // (g) l'ordine delle candidate dirs è deterministico: MiKTeX per-utente
    // prima (LOCALAPPDATA), poi roaming (APPDATA), poi il sistema; le
    // radici utente assenti non alterano l'ordine delle restanti.
    #[test]
    fn candidate_dirs_ordine_deterministico_miktex_utente_prima() {
        let local = Path::new(r"C:\Users\mario\AppData\Local");
        let roaming = Path::new(r"C:\Users\mario\AppData\Roaming");
        let dirs = candidate_dirs(TargetOs::Windows, Some(local), Some(roaming), None);
        // Le aspettative costruiscono gli stessi componenti con Path::join:
        // l'ORDINE e la struttura sono ciò che il test verifica, i separatori
        // sono quelli del sistema ospite (su Windows li decide Path::join).
        let miktex = |root: &Path| {
            root.join("Programs")
                .join("MiKTeX")
                .join("miktex")
                .join("bin")
                .join("x64")
        };
        assert_eq!(
            dirs,
            vec![
                miktex(local),
                miktex(roaming),
                PathBuf::from(r"C:\Program Files\MiKTeX\miktex\bin\x64"),
            ],
            "MiKTeX per-utente prima, poi roaming, poi sistema"
        );
        // Radici utente assenti: restano le sole dir di sistema, nell'ordine.
        assert_eq!(
            candidate_dirs(TargetOs::Windows, None, None, None),
            vec![PathBuf::from(r"C:\Program Files\MiKTeX\miktex\bin\x64")]
        );
        // La stessa chiamata dà lo stesso elenco: nessuna dipendenza
        // dall'ordine di lettura del filesystem.
        assert_eq!(
            dirs,
            candidate_dirs(TargetOs::Windows, Some(local), Some(roaming), None)
        );
        // macOS e Linux: texbin di sistema prima, poi le bin standard.
        assert_eq!(
            candidate_dirs(TargetOs::MacOS, None, None, None),
            vec![
                PathBuf::from("/Library/TeX/texbin"),
                PathBuf::from("/usr/local/bin")
            ]
        );
        assert_eq!(
            candidate_dirs(TargetOs::Linux, None, None, None),
            vec![PathBuf::from("/usr/bin"), PathBuf::from("/usr/local/bin")]
        );
    }

    // (h) TeX Live: anno più recente prima e bin\windows prima di bin\win32;
    // le dir senza bin e i file spuri non incidono sull'elenco.
    #[test]
    fn texlive_anno_piu_recente_prima_e_windows_prima_di_win32() {
        let root = temp_root("texlive");
        for (version, kind) in [
            ("2019", "win32"),
            ("2023", "windows"),
            ("2021", "win32"),
            ("2025", "windows"),
        ] {
            let d = root.join(version).join("bin").join(kind);
            std::fs::create_dir_all(&d).unwrap();
        }
        // Dir senza ramo bin\windows né bin\win32 e un file spurio: fuori.
        std::fs::create_dir_all(root.join("2020").join("bin")).unwrap();
        std::fs::write(root.join("non-una-versione"), "x").unwrap();
        let dirs = candidate_dirs(TargetOs::Windows, None, None, Some(&root));
        assert_eq!(
            dirs,
            vec![
                // MiKTeX di sistema viene prima del glob TeX Live.
                PathBuf::from(r"C:\Program Files\MiKTeX\miktex\bin\x64"),
                root.join("2025").join("bin").join("windows"),
                root.join("2023").join("bin").join("windows"),
                root.join("2021").join("bin").join("win32"),
                root.join("2019").join("bin").join("win32"),
            ],
            "anno più recente prima, bin\\windows prima di bin\\win32"
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    // (i) la risoluzione segue l'ordine di preferenza, gestisce il suffisso
    // «.exe» di Windows e lascia None un tool assente ovunque.
    #[test]
    fn risoluzione_ordine_di_preferenza_suffisso_e_assenza() {
        let root = temp_root("resolve");
        let prima = root.join("prima");
        let seconda = root.join("seconda");
        std::fs::create_dir_all(&prima).unwrap();
        std::fs::create_dir_all(&seconda).unwrap();
        std::fs::write(seconda.join("morsa-fake"), "#!/bin/sh\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(
                seconda.join("morsa-fake"),
                std::fs::Permissions::from_mode(0o755),
            )
            .unwrap();
        }
        // Solo nella seconda dir: vince l'unica occorrenza.
        assert_eq!(
            resolve_tool_with_suffix("morsa-fake", &[prima.clone(), seconda.clone()], ""),
            Some(seconda.join("morsa-fake")),
            "la prima directory che contiene il tool vince"
        );
        // Nella prima dir c'è anche il .exe: col suffisso .exe vince la prima.
        std::fs::write(prima.join("morsa-fake.exe"), "x").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(
                prima.join("morsa-fake.exe"),
                std::fs::Permissions::from_mode(0o755),
            )
            .unwrap();
        }
        assert_eq!(
            resolve_tool_with_suffix("morsa-fake", &[prima.clone(), seconda.clone()], ".exe"),
            Some(prima.join("morsa-fake.exe")),
            "il suffisso esplicito rende verificabile il ramo «name.exe» su qualunque host"
        );
        // Assente ovunque → None: il tool resta non disponibile.
        assert_eq!(
            resolve_tool("morsa-assente-ovunque", &[prima, seconda]),
            None,
            "un tool assente da tutte le candidate dirs non è risolto"
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    // (j) IL DISCRIMINANTE della risoluzione: un tool presente in una
    // candidate dir si trova ANCHE quando il PATH di processo non lo
    // contiene (il caso del bug MORSA: l'app segnala «Nessuna distribuzione
    // LaTeX trovata» mentre pdflatex --version funziona da cmd). La prova
    // ROSSA contro la detection PATH-only attuale è nell'allegato della
    // consegna; qui l'elenco candidate e la risoluzione lo trovano.
    #[test]
    fn tool_nelle_candidate_dirs_risolto_anche_se_il_path_non_lo_contiene() {
        let root = temp_root("candidate");
        let bin = root
            .join("Programs")
            .join("MiKTeX")
            .join("miktex")
            .join("bin")
            .join("x64");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::write(bin.join("morsa-fake-latexmk"), "#!/bin/sh\n").unwrap();
        std::fs::write(bin.join("morsa-fake-latexmk.exe"), "x").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            for f in ["morsa-fake-latexmk", "morsa-fake-latexmk.exe"] {
                std::fs::set_permissions(
                    bin.join(f),
                    std::fs::Permissions::from_mode(0o755),
                )
                .unwrap();
            }
        }
        let dirs = candidate_dirs(TargetOs::Windows, Some(&root), None, None);
        // La candidate dir MiKTeX per-utente è la prima dell'elenco...
        assert_eq!(dirs[0], bin, "MiKTeX per-utente prima di tutto il resto");
        // ...e la risoluzione la trova sia col nome (macOS/Linux) sia col
        // suffisso .exe (Windows).
        assert_eq!(
            resolve_tool_with_suffix("morsa-fake-latexmk", &dirs, ""),
            Some(bin.join("morsa-fake-latexmk"))
        );
        assert_eq!(
            resolve_tool_with_suffix("morsa-fake-latexmk", &dirs, ".exe"),
            Some(bin.join("morsa-fake-latexmk.exe"))
        );
        // Sul sistema corrente, col suffisso di piattaforma giusto.
        let expected = if cfg!(windows) {
            bin.join("morsa-fake-latexmk.exe")
        } else {
            bin.join("morsa-fake-latexmk")
        };
        assert_eq!(resolve_tool("morsa-fake-latexmk", &dirs), Some(expected));
        let _ = std::fs::remove_dir_all(&root);
    }

    // (k) CRITICO: gli spawn usano il PERCORSO risolto, mai il nome nudo
    // quando la risoluzione l'ha trovato — altrimenti la detection trova il
    // tool e la compilazione fallirebbe comunque.
    #[test]
    fn gli_spawn_usano_il_percorso_risolto_mai_il_nome_nudo() {
        let mut paths = ToolPaths::default();
        paths.set_resolved(
            "latexmk",
            Some(
                r"C:\Users\mario\AppData\Local\Programs\MiKTeX\miktex\bin\x64\latexmk.exe"
                    .into(),
            ),
        );
        paths.set_resolved("xelatex", Some("/Library/TeX/texbin/xelatex".into()));
        assert_eq!(
            paths.program("latexmk"),
            r"C:\Users\mario\AppData\Local\Programs\MiKTeX\miktex\bin\x64\latexmk.exe",
            "il passo latexmk deve partire col percorso risolto"
        );
        assert_eq!(paths.program("xelatex"), "/Library/TeX/texbin/xelatex");
        // Tool raggiungibile dal PATH (nessun percorso registrato): il nome
        // resta il programma da eseguire — comportamento invariato.
        assert_eq!(paths.program("pdflatex"), "pdflatex");
        // Nomi fuori dalla mappa: nessun percorso da applicare.
        assert_eq!(paths.program("bibtex"), "bibtex");
    }

    // (l) le fasi della build portano i percorsi risolti.
    #[test]
    fn le_fasi_della_build_portano_i_percorsi_risolti() {
        let mut paths = ToolPaths::default();
        paths.set_resolved("latexmk", Some("/opt/texbin/latexmk".into()));
        paths.set_resolved("pdflatex", Some("/opt/texbin/pdflatex".into()));

        // Modalità latexmk: un passo solo, col percorso risolto di latexmk.
        let fasi = build_phases(true, "pdflatex", &paths, vec!["-pdf".into(), "main.tex".into()]);
        assert_eq!(
            fasi,
            vec![Step::Bib(
                "/opt/texbin/latexmk".into(),
                vec!["-pdf".into(), "main.tex".into()]
            )]
        );

        // Modalità motore: il motore col percorso risolto.
        let fasi = build_phases(false, "pdflatex", &paths, vec![]);
        assert_eq!(fasi, vec![Step::Engine("/opt/texbin/pdflatex".into())]);

        // Nessun percorso risolto (il PATH basta): nomi nudi, come prima.
        let fasi = build_phases(false, "xelatex", &ToolPaths::default(), vec![]);
        assert_eq!(fasi, vec![Step::Engine("xelatex".into())]);
    }

    // (m) il passo bibliografico dai marker del primo passaggio: \bibdata
    // chiede BibTeX, altrimenti biber (marker \abx@aux nell'aux o file .bcf).
    #[test]
    fn il_passo_bibliografico_dai_marker_del_primo_passaggio() {
        assert_eq!(bib_need("\\bibdata{biblio}", false), Some(BibNeed::Bibtex));
        assert_eq!(bib_need("\\abx@aux{ref}{0}", false), Some(BibNeed::Biber));
        assert_eq!(bib_need("", true), Some(BibNeed::Biber), "il file .bcf basta");
        // \bibdata vince: è il marker che BibTeX consuma direttamente.
        assert_eq!(
            bib_need("\\bibdata{x}\\abx@aux{y}{1}", true),
            Some(BibNeed::Bibtex)
        );
        assert_eq!(bib_need("niente bibliografia", false), None);
    }
}

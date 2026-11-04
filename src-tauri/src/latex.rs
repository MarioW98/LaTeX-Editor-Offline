//! Detection of the local LaTeX toolchain.
//!
//! Engines are looked up first in the optional user override directory
//! (global setting `latexPathOverride`), then on the system `PATH`.

use std::path::{Path, PathBuf};

use serde::Serialize;

pub const ENGINES: [&str; 3] = ["pdflatex", "xelatex", "lualatex"];

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EngineInfo {
    pub name: String,
    pub path: String,
    pub version: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LatexReport {
    pub found: bool,
    pub engines: Vec<EngineInfo>,
    pub latexmk_path: Option<String>,
    pub bibtex_path: Option<String>,
    pub biber_path: Option<String>,
    pub distribution: Option<String>,
}

/// Locate a binary: override directory first, then `PATH`.
pub fn find_binary(name: &str, override_dir: Option<&str>) -> Option<PathBuf> {
    if let Some(dir) = override_dir {
        let dir = dir.trim();
        if !dir.is_empty() {
            let exe = if cfg!(windows) {
                format!("{name}.exe")
            } else {
                name.to_string()
            };
            let candidate = Path::new(dir).join(&exe);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    which::which(name).ok()
}

/// Run `<binary> --version` and return the first output line.
fn version_line(binary: &Path) -> String {
    let mut cmd = std::process::Command::new(binary);
    cmd.arg("--version");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: never flash a console window.
        cmd.creation_flags(0x0800_0000);
    }
    match cmd.output() {
        Ok(out) => {
            let text = String::from_utf8_lossy(&out.stdout);
            text.lines()
                .next()
                .unwrap_or("")
                .trim()
                .to_string()
        }
        Err(_) => String::new(),
    }
}

fn guess_distribution(version: &str) -> Option<String> {
    let lower = version.to_lowercase();
    if lower.contains("miktex") {
        Some("MiKTeX".into())
    } else if lower.contains("tex live") {
        Some("TeX Live".into())
    } else {
        None
    }
}

/// Full detection report used by the UI (and to show install guidance).
pub fn detect(override_dir: Option<&str>) -> LatexReport {
    let mut engines = Vec::new();
    for name in ENGINES {
        if let Some(path) = find_binary(name, override_dir) {
            let version = version_line(&path);
            engines.push(EngineInfo {
                name: name.to_string(),
                path: path.to_string_lossy().into_owned(),
                version,
            });
        }
    }
    let latexmk_path = find_binary("latexmk", override_dir);
    let bibtex_path = find_binary("bibtex", override_dir);
    let biber_path = find_binary("biber", override_dir);
    let distribution = engines
        .first()
        .and_then(|e| guess_distribution(&e.version));
    LatexReport {
        found: !engines.is_empty(),
        engines,
        latexmk_path: latexmk_path.map(|p| p.to_string_lossy().into_owned()),
        bibtex_path: bibtex_path.map(|p| p.to_string_lossy().into_owned()),
        biber_path: biber_path.map(|p| p.to_string_lossy().into_owned()),
        distribution,
    }
}

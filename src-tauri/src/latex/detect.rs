//! Rilevamento degli strumenti LaTeX installati (latexmk, motori, bibtex/biber).
//!
//! Ordine di ricerca: cartella/binario configurato nelle impostazioni,
//! poi cartelle convenzionali (es. `/Library/TeX/texbin` su macOS), poi `PATH`.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ToolInfo {
    pub path: String,
    pub version: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LatexInfo {
    pub engines: BTreeMap<String, Option<ToolInfo>>,
}

pub const TOOL_NAMES: [&str; 6] = ["latexmk", "pdflatex", "xelatex", "lualatex", "bibtex", "biber"];

#[cfg(windows)]
const EXE_SUFFIX: &str = ".exe";
#[cfg(not(windows))]
const EXE_SUFFIX: &str = "";

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn with_no_window(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    let _ = cmd;
}

#[cfg(unix)]
fn is_executable(p: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    p.is_file()
        && p.metadata()
            .map(|m| m.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(p: &Path) -> bool {
    p.is_file()
}

/// Cerca uno strumento: prima `bin_dir` (cartella oppure percorso completo
/// dell'eseguibile), poi le cartelle convenzionali, poi `PATH`.
pub fn find_tool(name: &str, bin_dir: Option<&str>) -> Option<PathBuf> {
    let exe_name = format!("{name}{EXE_SUFFIX}");

    if let Some(dir) = bin_dir {
        let p = Path::new(dir);
        if p.is_file() {
            let fname = p.file_name()?.to_string_lossy().to_lowercase();
            if fname == exe_name.to_lowercase() || fname == name.to_lowercase() {
                return Some(p.to_path_buf());
            }
        } else if p.is_dir() {
            let candidate = p.join(&exe_name);
            if is_executable(&candidate) {
                return Some(candidate);
            }
        }
    }

    for dir in extra_dirs() {
        let candidate = dir.join(&exe_name);
        if is_executable(&candidate) {
            return Some(candidate);
        }
    }

    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            let candidate = dir.join(&exe_name);
            if is_executable(&candidate) {
                return Some(candidate);
            }
        }
    }
    None
}

/// Cartelle note per distribuzioni TeX, al di fuori del PATH tipico di un'app GUI.
fn extra_dirs() -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = Vec::new();
    #[cfg(target_os = "macos")]
    {
        v.push(PathBuf::from("/Library/TeX/texbin"));
        v.push(PathBuf::from("/opt/homebrew/bin"));
        if let Ok(entries) = std::fs::read_dir("/usr/local/texlive") {
            for e in entries.flatten() {
                for bin in ["universal-darwin", "x86_64-darwin", "aarch64-darwin"] {
                    let p = e.path().join("bin").join(bin);
                    if p.is_dir() {
                        v.push(p);
                    }
                }
            }
        }
        if let Some(home) = std::env::var_os("HOME") {
            let h = PathBuf::from(home);
            for bin in ["universal-darwin", "x86_64-darwin", "aarch64-darwin"] {
                v.push(h.join("Library/TinyTeX/bin").join(bin));
            }
        }
    }
    #[cfg(target_os = "linux")]
    {
        v.push(PathBuf::from("/usr/local/bin"));
        if let Some(home) = std::env::var_os("HOME") {
            let h = PathBuf::from(home);
            v.push(h.join(".local/bin"));
            v.push(h.join("bin"));
        }
    }
    #[cfg(target_os = "windows")]
    {
        if let Some(lad) = std::env::var_os("LOCALAPPDATA") {
            v.push(PathBuf::from(lad).join(r"Programs\MiKTeX\miktex\bin\x64"));
            v.push(PathBuf::from(lad).join(r"Programs\MiKTeX\miktex\bin"));
        }
        if let Some(ad) = std::env::var_os("APPDATA") {
            v.push(PathBuf::from(ad).join(r"TinyTeX\bin\windows"));
        }
    }
    v
}

/// Esegue `--version` con watchdog di 3 secondi e restituisce la prima riga.
pub fn tool_version(exe: &Path) -> Option<String> {
    let mut cmd = Command::new(exe);
    cmd.arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    with_no_window(&mut cmd);
    let mut child = cmd.spawn().ok()?;
    let stdout = child.stdout.take()?;

    let holder = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
    let sink = holder.clone();
    let reader = std::thread::spawn(move || {
        use std::io::Read;
        let mut s = String::new();
        let mut r = stdout;
        let _ = r.read_to_string(&mut s);
        if let Ok(mut g) = sink.lock() {
            *g = s;
        }
    });

    for _ in 0..30 {
        if matches!(child.try_wait(), Ok(Some(_))) {
            break;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    if matches!(child.try_wait(), Ok(None)) {
        let _ = child.kill();
        let _ = child.wait();
    }
    let _ = reader.join();

    let guard = holder.lock().ok()?;
    guard
        .lines()
        .next()
        .map(|l| l.chars().take(100).collect())
}

pub fn detect_all(bin_dir: Option<&str>) -> LatexInfo {
    let mut engines = BTreeMap::new();
    for name in TOOL_NAMES {
        let value = find_tool(name, bin_dir).map(|p| ToolInfo {
            version: tool_version(&p),
            path: p.display().to_string(),
        });
        engines.insert(name.to_string(), value);
    }
    LatexInfo { engines }
}

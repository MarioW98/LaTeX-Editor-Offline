//! Motore LaTeX: whitelist, costruzione degli argomenti di compilazione e
//! utilità di analisi di log/aux. Logica pura, senza dipendenze da Tauri.

pub const ENGINE_IDS: [&str; 3] = ["pdflatex", "xelatex", "lualatex"];

pub fn is_engine(s: &str) -> bool {
    ENGINE_IDS.contains(&s)
}

/// Flag latexmk per selezionare il motore desiderato.
pub fn latexmk_engine_flag(engine: &str) -> &'static str {
    match engine {
        "xelatex" => "-pdfxe",
        "lualatex" => "-pdflua",
        _ => "-pdf",
    }
}

/// Nome base (senza estensione) del file principale = jobname TeX.
pub fn jobname(main_file: &str) -> String {
    let normalized = main_file.replace('\\', "/");
    let name = normalized.rsplit('/').next().unwrap_or(&normalized);
    match name.rfind('.') {
        Some(pos) if pos > 0 => name[..pos].to_string(),
        _ => name.to_string(),
    }
}

/// Argomenti per una singola passata di motore (pipeline di fallback).
pub fn engine_args(main_file: &str, out_dir: &str, allow_shell_escape: bool) -> Vec<String> {
    let mut args = vec![
        "-interaction=nonstopmode".to_string(),
        "-file-line-error".to_string(),
        "-halt-on-error".to_string(),
        format!("-output-directory={out_dir}"),
    ];
    if allow_shell_escape {
        // Otticamente disabilitato: attivato solo esplicitamente dalle impostazioni.
        args.push("-shell-escape".to_string());
    }
    args.push(main_file.to_string());
    args
}

/// Argomenti per latexmk (pipeline preferita quando disponibile).
pub fn latexmk_args(main_file: &str, out_dir: &str, engine: &str, allow_shell_escape: bool) -> Vec<String> {
    let mut args = vec![
        "-interaction=nonstopmode".to_string(),
        "-file-line-error".to_string(),
        latexmk_engine_flag(engine).to_string(),
        format!("-outdir={out_dir}"),
    ];
    if allow_shell_escape {
        args.push("-shell-escape".to_string());
    }
    args.push(main_file.to_string());
    args
}

/// Il log chiede un'altra passata per sistemare riferimenti?
pub fn needs_rerun(log: &str) -> bool {
    log.contains("Rerun to get")
        || log.contains("Label(s) may have changed")
        || log.contains("Rerun LaTeX")
}

/// L'.aux contiene dati bibliografici (richiede bibtex)?
pub fn wants_bibtex(aux: &str) -> bool {
    aux.contains("\\bibdata") || aux.contains("\\bibstyle")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jobname_percorsi() {
        assert_eq!(jobname("main.tex"), "main");
        assert_eq!(jobname("src/paper.tex"), "paper");
        assert_eq!(jobname("chapters\\cap1.tex"), "cap1");
    }

    #[test]
    fn argomenti_engine() {
        let args = engine_args("main.tex", ".latex-editor/build", false);
        assert_eq!(args[0], "-interaction=nonstopmode");
        assert!(args.contains(&"-output-directory=.latex-editor/build".to_string()));
        assert!(!args.iter().any(|a| a == "-shell-escape"));
        let args2 = engine_args("main.tex", ".latex-editor/build", true);
        assert!(args2.iter().any(|a| a == "-shell-escape"));
    }

    #[test]
    fn flag_latexmk() {
        assert_eq!(latexmk_engine_flag("xelatex"), "-pdfxe");
        assert_eq!(latexmk_engine_flag("lualatex"), "-pdflua");
        assert_eq!(latexmk_engine_flag("pdflatex"), "-pdf");
    }

    #[test]
    fn rerun() {
        assert!(needs_rerun("LaTeX Warning: Label(s) may have changed. Rerun to get cross-references right."));
        assert!(!needs_rerun("Output written on main.pdf (3 pages)."));
        assert!(wants_bibtex("\\bibdata{bibliography}\n\\bibstyle{plain}"));
    }
}

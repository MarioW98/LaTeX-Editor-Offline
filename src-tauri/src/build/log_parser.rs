//! Parser best-effort dei log LaTeX.
//!
//! Riconosce:
//! - errori in formato `file:riga: messaggio` (attivato da `-file-line-error`);
//! - errori classici `! Messaggio` con eventuale `l.<n>` nelle righe successive;
//! - avvisi `LaTeX Warning:`, `Package X Warning:`, `Class X Warning:`,
//!   `Overfull/Underfull \hbox`, `pdfTeX warning`.
//!
//! Traccia inoltre lo stack dei file aperti `(./main.tex (./a.tex ...` per
//! associare un file agli errori che non lo indicano esplicitamente.
//! I log LaTeX spezzano le righe a 79 caratteri: il parsing è euristico.

use serde::Serialize;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    /// `"error"` oppure `"warning"`.
    pub severity: String,
    /// Percorso relativo al progetto (separatori `/`), se noto.
    pub file: Option<String>,
    pub line: Option<u32>,
    pub message: String,
    /// Nome del pacchetto/classe che ha prodotto l'avviso.
    pub source: Option<String>,
}

const MAX_ISSUES: usize = 300;

pub fn parse_log(log: &str, root: Option<&str>) -> Vec<Issue> {
    let lines: Vec<&str> = log.lines().collect();
    let mut issues: Vec<Issue> = Vec::new();
    let mut stack: Vec<String> = Vec::new();

    let mut i = 0usize;
    while i < lines.len() {
        let line = lines[i];
        track_files(line, &mut stack);
        let trimmed = line.trim_start();

        if let Some(mut issue) = parse_file_line_error(trimmed, root) {
            // Se il file non è noto usa lo stack corrente.
            if issue.file.is_none() {
                issue.file = current_file(&stack, root);
            }
            push_issue(&mut issues, issue);
            i += 1;
            continue;
        }

        if trimmed.starts_with('!') {
            let msg = trimmed.trim_start_matches('!').trim().to_string();
            let mut lineno = None;
            let look_max = (i + 4).min(lines.len());
            for j in (i + 1)..look_max {
                if let Some(n) = parse_l_line(lines[j]) {
                    lineno = Some(n);
                    break;
                }
            }
            push_issue(
                &mut issues,
                Issue {
                    severity: "error".into(),
                    file: current_file(&stack, root),
                    line: lineno,
                    message: msg,
                    source: None,
                },
            );
            i += 1;
            continue;
        }

        if let Some(issue) = parse_latex_warning(trimmed, &stack, root) {
            push_issue(&mut issues, issue);
            i += 1;
            continue;
        }

        if let Some(issue) = parse_package_warning(trimmed, &stack, root) {
            push_issue(&mut issues, issue);
            i += 1;
            continue;
        }

        if trimmed.starts_with("Overfull") || trimmed.starts_with("Underfull") {
            let line_no = trimmed
                .find("at lines ")
                .and_then(|p| {
                    let rest = &trimmed[p + "at lines ".len()..];
                    let end = rest.find("--").unwrap_or(rest.len());
                    rest[..end].parse::<u32>().ok()
                })
                .or_else(|| extract_input_line(trimmed));
            push_issue(
                &mut issues,
                Issue {
                    severity: "warning".into(),
                    file: current_file(&stack, root),
                    line: line_no,
                    message: trimmed.to_string(),
                    source: None,
                },
            );
            i += 1;
            continue;
        }

        if trimmed.starts_with("pdfTeX warning") {
            push_issue(
                &mut issues,
                Issue {
                    severity: "warning".into(),
                    file: current_file(&stack, root),
                    line: None,
                    message: trimmed.to_string(),
                    source: Some("pdfTeX".into()),
                },
            );
        }

        i += 1;
    }

    dedup(issues)
}

/// Aggiorna lo stack dei file aperti analizzando parentesi e token path-like.
fn track_files(line: &str, stack: &mut Vec<String>) {
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '(' => {
                let mut tok = String::new();
                while let Some(&n) = chars.peek() {
                    if n == ')' || n == '(' || n.is_whitespace() {
                        break;
                    }
                    tok.push(n);
                    chars.next();
                }
                maybe_push(&tok, stack);
            }
            ')' => {
                if !stack.is_empty() {
                    stack.pop();
                }
            }
            _ => {}
        }
    }
}

fn maybe_push(tok: &str, stack: &mut Vec<String>) {
    let t = tok.trim();
    if t.len() > 1 && (t.contains('.') || t.contains('/') || t.contains('\\')) {
        stack.push(t.to_string());
    }
}

fn current_file(stack: &[String], root: Option<&str>) -> Option<String> {
    let top = stack.last()?;
    Some(normalize_file(top, root))
}

fn normalize_file(raw: &str, root: Option<&str>) -> String {
    let mut s = raw.trim().to_string();
    while let Some(stripped) = s.strip_prefix("./") {
        s = stripped.to_string();
    }
    s = s.replace('\\', "/");
    if let Some(root) = root {
        let root_n = root.replace('\\', "/");
        if let Some(stripped) = s.strip_prefix(&root_n) {
            s = stripped.trim_start_matches('/').to_string();
        }
    }
    s
}

/// `./main.tex:12: messaggio`
fn parse_file_line_error(trimmed: &str, root: Option<&str>) -> Option<Issue> {
    if trimmed.is_empty() || trimmed.starts_with('!') {
        return None;
    }
    let first_colon = trimmed.find(':')?;
    let left = &trimmed[..first_colon];
    if left.is_empty() || left.starts_with('!') || left.contains(' ') && !left.contains('/') && !left.contains('\\') && !left.contains('.') {
        return None;
    }
    let rest = &trimmed[first_colon + 1..];
    if !rest.starts_with(|c: char| c.is_ascii_digit()) {
        return None;
    }
    let digits_end = rest.find(':')?;
    let line_no: u32 = rest[..digits_end].parse().ok()?;
    let message = rest[digits_end + 1..].trim().to_string();
    Some(Issue {
        severity: "error".into(),
        file: Some(normalize_file(left, root)),
        line: Some(line_no),
        message,
        source: None,
    })
}

/// `l.123 ...`
fn parse_l_line(line: &str) -> Option<u32> {
    let trimmed = line.trim_start();
    let rest = trimmed.strip_prefix("l.")?;
    let end = rest.find(|c: char| !c.is_ascii_digit()).unwrap_or(rest.len());
    if end == 0 {
        return None;
    }
    rest[..end].parse().ok()
}

/// `LaTeX Warning: ... (on input line N).`
fn parse_latex_warning(trimmed: &str, stack: &[String], root: Option<&str>) -> Option<Issue> {
    let rest = trimmed.strip_prefix("LaTeX Warning:")?;
    Some(Issue {
        severity: "warning".into(),
        file: current_file(stack, root),
        line: extract_input_line(trimmed),
        message: rest.trim().to_string(),
        source: Some("LaTeX".into()),
    })
}

/// `Package X Warning: ...` / `Class X Warning: ...` / `Package X Error: ...`
fn parse_package_warning(trimmed: &str, stack: &[String], root: Option<&str>) -> Option<Issue> {
    for kind in ["Package", "Class"] {
        let Some(after) = trimmed.strip_prefix(kind) else { continue };
        let after = after.trim_start();
        // nome pacchetto fino a " Warning:" o " Error:"
        for label in ["Warning:", "Error:"] {
            if let Some(pos) = after.find(label) {
                let name = after[..pos].trim();
                if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
                    continue;
                }
                let message = after[pos + label.len()..].trim().to_string();
                let severity = if label == "Error:" { "error" } else { "warning" };
                return Some(Issue {
                    severity: severity.into(),
                    file: current_file(stack, root),
                    line: extract_input_line(trimmed),
                    message,
                    source: Some(name.to_string()),
                });
            }
        }
    }
    None
}

fn extract_input_line(text: &str) -> Option<u32> {
    let pos = text.find("on input line ")?;
    let rest = &text[pos + "on input line ".len()..];
    let end = rest
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(rest.len());
    if end == 0 {
        return None;
    }
    rest[..end].parse().ok()
}

fn push_issue(issues: &mut Vec<Issue>, issue: Issue) {
    if issues.len() < MAX_ISSUES {
        issues.push(issue);
    }
}

fn dedup(mut issues: Vec<Issue>) -> Vec<Issue> {
    let mut out: Vec<Issue> = Vec::with_capacity(issues.len());
    for issue in issues.drain(..) {
        if let Some(last) = out.last() {
            if last.severity == issue.severity
                && last.file == issue.file
                && last.line == issue.line
                && last.message == issue.message
                && last.source == issue.source
            {
                continue;
            }
        }
        out.push(issue);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn errore_file_line() {
        let log = "This is pdfTeX\n(./main.tex\n./main.tex:12: Undefined control sequence.\nl.12 \\badcmd\n";
        let issues = parse_log(log, None);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].severity, "error");
        assert_eq!(issues[0].file.as_deref(), Some("main.tex"));
        assert_eq!(issues[0].line, Some(12));
        assert!(issues[0].message.contains("Undefined control sequence"));
    }

    #[test]
    fn errore_classico_con_file_da_stack() {
        let log = "(./src/paper.tex\n! LaTeX Error: File `x.sty' not found.\nl.7 \\usepackage\n{x}\n";
        let issues = parse_log(log, None);
        assert!(!issues.is_empty());
        let e = &issues[0];
        assert_eq!(e.severity, "error");
        assert_eq!(e.file.as_deref(), Some("src/paper.tex"));
        assert_eq!(e.line, Some(7));
    }

    #[test]
    fn avvisi_vari() {
        let log = "(./main.tex\nLaTeX Warning: Reference `fig:x' undefined on input line 30.\nPackage biblatex Warning: Please (re)run Biber.\nOverfull \\hbox (12.5pt too wide) in paragraph at lines 44--46\n)\n";
        let issues = parse_log(log, None);
        assert_eq!(issues.len(), 3);
        assert_eq!(issues[0].line, Some(30));
        assert_eq!(issues[0].source.as_deref(), Some("LaTeX"));
        assert_eq!(issues[1].source.as_deref(), Some("biblatex"));
        assert_eq!(issues[2].line, Some(44));
        assert!(issues[2].message.starts_with("Overfull"));
    }

    #[test]
    fn non_rileva_righe_normali() {
        let issues = parse_log("Output written on main.pdf (3 pages, 100 bytes).\n", None);
        assert!(issues.is_empty());
    }

    #[test]
    fn deduplica_consecutivi() {
        let log = "LaTeX Warning: Reference `x' undefined on input line 5.\nLaTeX Warning: Reference `x' undefined on input line 5.\n";
        let issues = parse_log(log, None);
        assert_eq!(issues.len(), 1);
    }
}

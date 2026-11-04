//! Heuristic LaTeX log parser.
//!
//! Recognised patterns (with `-file-line-error -interaction=nonstopmode`):
//! - `./main.tex:12: <message>`  → error with file + line
//! - `!<message>` followed by an `l.<n>` context line → error with line
//! - `LaTeX Warning: ...`, `Package ... Warning: ...`, `Overfull \hbox`,
//!   undefined references/citations → warnings
//!
//! This is intentionally a heuristic: full TeX log parsing requires tracking
//! the open-file parenthesis stack, which is out of scope for milestone 1.

use std::path::Path;

use regex::Regex;
use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LogIssue {
    pub kind: String, // "error" | "warning"
    pub file: Option<String>,
    pub line: Option<u32>,
    pub message: String,
}

const MAX_ISSUES: usize = 400;

pub fn parse_file(log_path: &Path) -> Vec<LogIssue> {
    let bytes = match std::fs::read(log_path) {
        Ok(b) => b,
        Err(_) => return Vec::new(),
    };
    let text = String::from_utf8_lossy(&bytes).into_owned();
    parse_text(&text)
}

fn parse_text(text: &str) -> Vec<LogIssue> {
    let file_line_re = Regex::new(
        r"^(?:[A-Za-z]:)?([^:\s][^:]*\.(?:tex|sty|cls|bib|clo|cfg|fd|def|ltx|bst|dtx)):(\d+):\s*(.*)$",
    )
    .unwrap();
    let input_line_re = Regex::new(r"on input line (\d+)").unwrap();

    let mut issues: Vec<LogIssue> = Vec::new();
    let lines: Vec<&str> = text.lines().collect();
    let mut i = 0usize;

    while i < lines.len() {
        if issues.len() >= MAX_ISSUES {
            break;
        }
        let l = lines[i].trim_end();
        if l.is_empty() {
            i += 1;
            continue;
        }

        // ./main.tex:12: message — file:line:error format
        if let Some(caps) = file_line_re.captures(l) {
            let file = caps.get(1).map(|m| m.as_str().to_string());
            let line = caps.get(2).and_then(|m| m.as_str().parse::<u32>().ok());
            let message = caps
                .get(3)
                .map(|m| m.as_str().trim().to_string())
                .unwrap_or_default();
            if !message.is_empty() {
                issues.push(LogIssue {
                    kind: "error".into(),
                    file,
                    line,
                    message,
                });
            }
            i += 1;
            continue;
        }

        // "! Undefined control sequence." style errors
        if l.starts_with('!') && !l.starts_with("!!") {
            let message = l.trim_start_matches('!').trim().to_string();
            let mut line_no: Option<u32> = None;
            // scan the next few lines for the "l.<digits>" context line
            let mut j = i + 1;
            let mut scanned = 0;
            while j < lines.len() && scanned < 4 {
                let c = lines[j].trim_end();
                if c.is_empty() {
                    break;
                }
                if let Some(rest) = c.strip_prefix("l.") {
                    let digits: String =
                        rest.chars().take_while(|ch| ch.is_ascii_digit()).collect();
                    if let Ok(n) = digits.parse::<u32>() {
                        line_no = Some(n);
                        break;
                    }
                }
                j += 1;
                scanned += 1;
            }
            issues.push(LogIssue {
                kind: "error".into(),
                file: None,
                line: line_no,
                message: if message.is_empty() {
                    l.to_string()
                } else {
                    message
                },
            });
            i += 1;
            continue;
        }

        // warnings
        let is_warning = l.starts_with("LaTeX Warning:")
            || ((l.starts_with("Package ") || l.starts_with("Class ")) && l.contains(" Warning"))
            || l.contains("Overfull \\hbox")
            || l.contains("Underfull \\hbox")
            || l.contains("Citation `")
            || l.contains("Reference `")
            || l.contains("There were undefined references")
            || l.contains("Label(s) may have changed");
        if is_warning {
            let line_no = input_line_re
                .captures(l)
                .and_then(|c| c.get(1))
                .and_then(|m| m.as_str().parse::<u32>().ok());
            issues.push(LogIssue {
                kind: "warning".into(),
                file: None,
                line: line_no,
                message: l.trim().to_string(),
            });
        }

        i += 1;
    }

    issues
}

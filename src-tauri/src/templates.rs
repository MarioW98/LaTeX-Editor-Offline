//! Embedded original project templates.
//!
//! The template sources live in `/templates` at the repository root and are
//! embedded into the binary with `include_str!` — a single source of truth,
//! no runtime resource bundling needed. All template content is original
//! placeholder material, free to use and modify.

use std::path::Path;

use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::sandbox;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TemplateInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub files: Vec<String>,
}

struct TemplateDef {
    id: &'static str,
    name: &'static str,
    description: &'static str,
    files: &'static [(&'static str, &'static str)],
}

const TEMPLATES: &[TemplateDef] = &[
    TemplateDef {
        id: "article",
        name: "Articolo",
        description: "Articolo scientifico con abstract, sezioni, equazioni, tabella e bibliografia.",
        files: &[
            ("main.tex", include_str!("../../templates/article/main.tex")),
            ("bibliography.bib", include_str!("../../templates/article/bibliography.bib")),
            ("README.md", include_str!("../../templates/article/README.md")),
            (".gitignore", include_str!("../../templates/article/.gitignore")),
            (".latex-editor/project.json", include_str!("../../templates/article/.latex-editor/project.json")),
        ],
    },
    TemplateDef {
        id: "report",
        name: "Relazione",
        description: "Relazione tecnica con copertina automatica, indice e capitoli.",
        files: &[
            ("main.tex", include_str!("../../templates/report/main.tex")),
            ("bibliography.bib", include_str!("../../templates/report/bibliography.bib")),
            ("README.md", include_str!("../../templates/report/README.md")),
            (".gitignore", include_str!("../../templates/report/.gitignore")),
            (".latex-editor/project.json", include_str!("../../templates/report/.latex-editor/project.json")),
        ],
    },
    TemplateDef {
        id: "book",
        name: "Libro",
        description: "Libro con frontespizio, numerazione romana, capitoli e bibliografia finale.",
        files: &[
            ("main.tex", include_str!("../../templates/book/main.tex")),
            ("bibliography.bib", include_str!("../../templates/book/bibliography.bib")),
            ("README.md", include_str!("../../templates/book/README.md")),
            (".gitignore", include_str!("../../templates/book/.gitignore")),
            (".latex-editor/project.json", include_str!("../../templates/book/.latex-editor/project.json")),
        ],
    },
    TemplateDef {
        id: "beamer",
        name: "Presentazione",
        description: "Presentazione Beamer con title page, indice, elenchi e colonne.",
        files: &[
            ("main.tex", include_str!("../../templates/beamer/main.tex")),
            ("bibliography.bib", include_str!("../../templates/beamer/bibliography.bib")),
            ("README.md", include_str!("../../templates/beamer/README.md")),
            (".gitignore", include_str!("../../templates/beamer/.gitignore")),
            (".latex-editor/project.json", include_str!("../../templates/beamer/.latex-editor/project.json")),
        ],
    },
    TemplateDef {
        id: "thesis",
        name: "Tesi",
        description: "Tesi di laurea con frontespizio personalizzato, abstract e capitoli.",
        files: &[
            ("main.tex", include_str!("../../templates/thesis/main.tex")),
            ("bibliography.bib", include_str!("../../templates/thesis/bibliography.bib")),
            ("README.md", include_str!("../../templates/thesis/README.md")),
            (".gitignore", include_str!("../../templates/thesis/.gitignore")),
            (".latex-editor/project.json", include_str!("../../templates/thesis/.latex-editor/project.json")),
        ],
    },
];

pub fn list() -> Vec<TemplateInfo> {
    TEMPLATES
        .iter()
        .map(|t| TemplateInfo {
            id: t.id.to_string(),
            name: t.name.to_string(),
            description: t.description.to_string(),
            files: t.files.iter().map(|(name, _)| name.to_string()).collect(),
        })
        .collect()
}

/// Create a new project folder from a template inside `parent_dir`.
/// The parent folder is chosen by the user through the native dialog, so it
/// can be anywhere on disk (the sandbox applies to the *project* afterwards).
pub fn create(template_id: &str, parent_dir: &str, project_name: &str) -> AppResult<String> {
    let def = TEMPLATES
        .iter()
        .find(|t| t.id == template_id)
        .ok_or_else(|| AppError::msg(format!("Modello sconosciuto: {template_id}")))?;
    sandbox::validate_file_name(project_name)?;

    let parent = Path::new(parent_dir);
    if !parent.is_dir() {
        return Err(AppError::NotFound(format!(
            "La cartella di destinazione non esiste: {parent_dir}"
        )));
    }
    let root = parent.join(project_name);
    if root.exists() {
        return Err(AppError::msg(format!(
            "Esiste già una cartella con il nome '{project_name}'."
        )));
    }
    std::fs::create_dir_all(&root)?;
    for (rel, content) in def.files {
        let target = root.join(rel);
        if let Some(dir) = target.parent() {
            std::fs::create_dir_all(dir)?;
        }
        std::fs::write(&target, content)?;
    }
    Ok(root.to_string_lossy().into_owned())
}

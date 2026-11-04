//! Template di progetto incorporati nel binario in fase di compilazione.
//!
//! I file sorgente dei template vivono in `templates/` del repository:
//! vengono inclusi con `include_str!` così l'app non dipende da percorsi
//! esterni a runtime e non effettua alcun download.

pub struct Template {
    pub id: &'static str,
    pub files: &'static [(&'static str, &'static str)],
}

pub const TEMPLATES: &[Template] = &[
    Template {
        id: "article",
        files: &[
            ("main.tex", include_str!("../../templates/article/main.tex")),
            ("bibliography.bib", include_str!("../../templates/article/bibliography.bib")),
            ("README.md", include_str!("../../templates/article/README.md")),
            (".gitignore", include_str!("../../templates/article/.gitignore")),
            (".latex-editor/project.json", include_str!("../../templates/article/.latex-editor/project.json")),
        ],
    },
    Template {
        id: "report",
        files: &[
            ("main.tex", include_str!("../../templates/report/main.tex")),
            ("bibliography.bib", include_str!("../../templates/report/bibliography.bib")),
            ("README.md", include_str!("../../templates/report/README.md")),
            (".gitignore", include_str!("../../templates/report/.gitignore")),
            (".latex-editor/project.json", include_str!("../../templates/report/.latex-editor/project.json")),
        ],
    },
    Template {
        id: "book",
        files: &[
            ("main.tex", include_str!("../../templates/book/main.tex")),
            ("bibliography.bib", include_str!("../../templates/book/bibliography.bib")),
            ("README.md", include_str!("../../templates/book/README.md")),
            (".gitignore", include_str!("../../templates/book/.gitignore")),
            (".latex-editor/project.json", include_str!("../../templates/book/.latex-editor/project.json")),
        ],
    },
    Template {
        id: "beamer",
        files: &[
            ("main.tex", include_str!("../../templates/beamer/main.tex")),
            ("bibliography.bib", include_str!("../../templates/beamer/bibliography.bib")),
            ("README.md", include_str!("../../templates/beamer/README.md")),
            (".gitignore", include_str!("../../templates/beamer/.gitignore")),
            (".latex-editor/project.json", include_str!("../../templates/beamer/.latex-editor/project.json")),
        ],
    },
    Template {
        id: "thesis",
        files: &[
            ("main.tex", include_str!("../../templates/thesis/main.tex")),
            ("bibliography.bib", include_str!("../../templates/thesis/bibliography.bib")),
            ("README.md", include_str!("../../templates/thesis/README.md")),
            (".gitignore", include_str!("../../templates/thesis/.gitignore")),
            (".latex-editor/project.json", include_str!("../../templates/thesis/.latex-editor/project.json")),
        ],
    },
];

pub fn get(id: &str) -> Option<&'static Template> {
    TEMPLATES.iter().find(|t| t.id == id)
}

pub fn ids() -> Vec<&'static str> {
    TEMPLATES.iter().map(|t| t.id).collect()
}

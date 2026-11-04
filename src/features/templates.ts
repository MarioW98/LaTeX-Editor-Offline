/**
 * The 5 original project templates shipped with the editor.
 * They are embedded in the frontend and materialized on disk through the
 * regular create/write commands: no extra Rust resources are needed and the
 * app stays a single self-contained bundle.
 */

export interface TemplateFile {
  path: string;
  content: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  files: TemplateFile[];
}

const BIB = `@book{knuth1986,
  author    = {Donald E. Knuth},
  title     = {The \\TeX{}book},
  publisher = {Addison-Wesley},
  year      = {1986}
}

@article{lamport1994,
  author  = {Leslie Lamport},
  title   = {LaTeX: A Document Preparation System},
  journal = {User's Guide and Reference Manual},
  year    = {1994}
}
`;

const GITIGNORE = `.latex-editor/build/
*.aux
*.log
*.out
*.toc
*.synctex.gz
`;

function projectJson(name: string, template: string): string {
  return JSON.stringify(
    { name, template, createdAt: new Date().toISOString() },
    null,
    2,
  );
}

export const TEMPLATES: Template[] = [
  {
    id: "article",
    name: "Article",
    description: "Articolo standard con sezioni, equazioni e bibliografia.",
    files: [
      {
        path: "main.tex",
        content: `\\documentclass[11pt,a4paper]{article}
\\usepackage[T1]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}
\\usepackage{graphicx}
\\usepackage{hyperref}

\\title{Titolo dell'articolo}
\\author{Nome Cognome}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{abstract}
Breve riassunto del contenuto dell'articolo.
\\end{abstract}

\\section{Introduzione}
Testo introduttivo con una citazione \\cite{knuth1986}.

\\section{Metodo}
Un'equazione in linea $E = mc^2$ e una in blocco:
\\begin{equation}
  \\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}
\\end{equation}

\\section{Conclusioni}
Conclusioni dell'articolo.

\\bibliographystyle{plain}
\\bibliography{bibliography}

\\end{document}
`,
      },
      { path: "bibliography.bib", content: BIB },
      { path: ".gitignore", content: GITIGNORE },
      { path: "README.md", content: "# Articolo\n\nProgetto creato dal template Article di LaTeX Editor Offline.\nCompila `main.tex` (F5).\n" },
      { path: ".latex-editor/project.json", content: projectJson("articolo", "article") },
    ],
  },
  {
    id: "report",
    name: "Report",
    description: "Rapporto tecnico con indice, capitoli e bibliografia.",
    files: [
      {
        path: "main.tex",
        content: `\\documentclass[11pt,a4paper]{report}
\\usepackage[T1]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}
\\usepackage{graphicx}
\\usepackage{hyperref}

\\title{Rapporto tecnico}
\\author{Nome Cognome}
\\date{\\today}

\\begin{document}
\\maketitle
\\tableofcontents

\\chapter{Introduzione}
Obiettivi del rapporto \\cite{lamport1994}.

\\section{Contesto}
Descrizione del contesto.

\\chapter{Analisi}
\\section{Dati}
Presentazione dei dati.

\\chapter{Conclusioni}
Sintesi dei risultati.

\\bibliographystyle{plain}
\\bibliography{bibliography}

\\end{document}
`,
      },
      { path: "bibliography.bib", content: BIB },
      { path: ".gitignore", content: GITIGNORE },
      { path: "README.md", content: "# Report\n\nProgetto creato dal template Report di LaTeX Editor Offline.\n" },
      { path: ".latex-editor/project.json", content: projectJson("report", "report") },
    ],
  },
  {
    id: "book",
    name: "Book",
    description: "Libro con frontespizio, capitoli e appendici.",
    files: [
      {
        path: "main.tex",
        content: `\\documentclass[11pt,a4paper]{book}
\\usepackage[T1]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}
\\usepackage{hyperref}

\\title{Titolo del libro}
\\author{Nome Cognome}
\\date{\\today}

\\begin{document}
\\frontmatter
\\maketitle
\\tableofcontents

\\mainmatter
\\chapter{Primo capitolo}
Testo del primo capitolo \\cite{knuth1986}.

\\chapter{Secondo capitolo}
Testo del secondo capitolo.

\\backmatter
\\appendix
\\chapter{Appendice}
Materiale aggiuntivo.

\\end{document}
`,
      },
      { path: "bibliography.bib", content: BIB },
      { path: ".gitignore", content: GITIGNORE },
      { path: "README.md", content: "# Book\n\nProgetto creato dal template Book di LaTeX Editor Offline.\n" },
      { path: ".latex-editor/project.json", content: projectJson("libro", "book") },
    ],
  },
  {
    id: "beamer",
    name: "Beamer",
    description: "Presentazione con frame pronti all'uso.",
    files: [
      {
        path: "main.tex",
        content: `\\documentclass{beamer}
\\usetheme{Madrid}
\\usepackage[utf8]{inputenc}

\\title{Titolo della presentazione}
\\subtitle{Creata con LaTeX Editor Offline}
\\author{Nome Cognome}
\\date{\\today}

\\begin{document}

\\frame{\\titlepage}

\\begin{frame}{Indice}
  \\tableofcontents
\\end{frame}

\\section{Introduzione}
\\begin{frame}{Introduzione}
  \\begin{itemize}
    \\item Primo punto
    \\item Secondo punto
    \\item Terzo punto
  \\end{itemize}
\\end{frame}

\\begin{frame}{Una formula}
  \\begin{equation}
    e^{i\\pi} + 1 = 0
  \\end{equation}
\\end{frame}

\\end{document}
`,
      },
      { path: "bibliography.bib", content: BIB },
      { path: ".gitignore", content: GITIGNORE },
      { path: "README.md", content: "# Beamer\n\nProgetto creato dal template Beamer di LaTeX Editor Offline.\n" },
      { path: ".latex-editor/project.json", content: projectJson("presentazione", "beamer") },
    ],
  },
  {
    id: "thesis",
    name: "Thesis",
    description: "Tesi con capitoli, abstract e bibliografia.",
    files: [
      {
        path: "main.tex",
        content: `\\documentclass[12pt,a4paper]{report}
\\usepackage[T1]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}
\\usepackage{setspace}
\\usepackage{hyperref}

\\title{Tesi di laurea\\\\Titolo della tesi}
\\author{Nome Cognome}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{abstract}
\\onehalfspacing
Abstract della tesi: obiettivi, metodo e risultati principali.
\\end{abstract}

\\tableofcontents

\\chapter{Introduzione}
\\section{Motivazione}
Perch\\'e questo lavoro \\cite{knuth1986}.

\\chapter{Stato dell'arte}
Rassegna della letteratura.

\\chapter{Metodo}
\\section{Materiali}
Descrizione del metodo.

\\chapter{Risultati e discussioni}
Analisi dei risultati.

\\chapter{Conclusioni}
Sintesi e sviluppi futuri.

\\bibliographystyle{plain}
\\bibliography{bibliography}

\\end{document}
`,
      },
      { path: "bibliography.bib", content: BIB },
      { path: ".gitignore", content: GITIGNORE },
      { path: "README.md", content: "# Thesis\n\nProgetto creato dal template Thesis di LaTeX Editor Offline.\n" },
      { path: ".latex-editor/project.json", content: projectJson("tesi", "thesis") },
    ],
  },
];

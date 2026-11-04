// LaTeX auto-completions:
// - static command list (~60 entries, with a few live templates)
// - `\begin{…}` environment completion that closes the environment
// - `\ref{…}` completion from labels found in the open buffers
// - `\cite{…}` completion from BibTeX keys found in the open buffers
// - BibTeX entry types inside `.bib` files

import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";

import { useAppStore } from "../state/store";
import { collectBibKeys, collectLabels, extname } from "../utils/misc";
import { isLatexLike } from "./language";

/** Insert `template`, placing the cursor where `$0` appears. */
function snippet(template: string): Completion["apply"] {
  return (view: EditorView, _completion: Completion, from: number, to: number): void => {
    const marker = "$0";
    const idx = template.indexOf(marker);
    const text = template.replace(marker, "");
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + (idx >= 0 ? idx : text.length) },
    });
  };
}

interface CmdDef {
  label: string;
  detail: string;
  type?: string;
  template?: string;
}

const COMMANDS: CmdDef[] = [
  { label: "\\documentclass", detail: "classe del documento", template: "\\documentclass{$0}" },
  { label: "\\usepackage", detail: "carica un pacchetto", template: "\\usepackage{$0}" },
  { label: "\\title", detail: "titolo", template: "\\title{$0}" },
  { label: "\\author", detail: "autore", template: "\\author{$0}" },
  { label: "\\date", detail: "data", template: "\\date{$0}" },
  { label: "\\maketitle", detail: "composizione del titolo" },
  { label: "\\tableofcontents", detail: "indice" },
  { label: "\\listoffigures", detail: "elenco delle figure" },
  { label: "\\listoftables", detail: "elenco delle tabelle" },
  { label: "\\newpage", detail: "nuova pagina" },
  { label: "\\clearpage", detail: "chiude le figure in sospeso e va a capo" },
  { label: "\\section", detail: "sezione", template: "\\section{$0}" },
  { label: "\\subsection", detail: "sottosezione", template: "\\subsection{$0}" },
  { label: "\\subsubsection", detail: "sotto-sottosezione", template: "\\subsubsection{$0}" },
  { label: "\\paragraph", detail: "titolo di paragrafo", template: "\\paragraph{$0}" },
  { label: "\\appendix", detail: "inizio appendice" },
  { label: "\\textbf", detail: "grassetto", template: "\\textbf{$0}" },
  { label: "\\textit", detail: "corsivo", template: "\\textit{$0}" },
  { label: "\\emph", detail: "enfasi", template: "\\emph{$0}" },
  { label: "\\underline", detail: "sottolineato", template: "\\underline{$0}" },
  { label: "\\texttt", detail: "monospazio", template: "\\texttt{$0}" },
  { label: "\\textsc", detail: "maiuscoletto", template: "\\textsc{$0}" },
  { label: "\\item", detail: "voce di elenco" },
  { label: "\\footnote", detail: "nota a pié di pagina", template: "\\footnote{$0}" },
  { label: "\\label", detail: "etichetta", template: "\\label{$0}" },
  { label: "\\ref", detail: "riferimento a un'etichetta", template: "\\ref{$0}" },
  { label: "\\eqref", detail: "riferimento a equazione (con parentesi)", template: "\\eqref{$0}" },
  { label: "\\pageref", detail: "riferimento al numero di pagina", template: "\\pageref{$0}" },
  { label: "\\cite", detail: "citazione bibliografica", template: "\\cite{$0}" },
  { label: "\\nocite", detail: "voce in bibliografia senza citazione" },
  { label: "\\bibliographystyle", detail: "stile della bibliografia", template: "\\bibliographystyle{$0}" },
  { label: "\\bibliography", detail: "file .bib", template: "\\bibliography{$0}" },
  { label: "\\addbibresource", detail: "risorsa biblatex", template: "\\addbibresource{$0}" },
  { label: "\\printbibliography", detail: "stampa la bibliografia (biblatex)" },
  { label: "\\input", detail: "include un file", template: "\\input{$0}" },
  { label: "\\include", detail: "include un file (con \clearpage)", template: "\\include{$0}" },
  { label: "\\includegraphics", detail: "inserisce un'immagine", template: "\\includegraphics[width=$0\\linewidth]{file}" },
  { label: "\\caption", detail: "didascalia", template: "\\caption{$0}" },
  { label: "\\centering", detail: "centra il contenuto" },
  { label: "\\newcommand", detail: "nuovo comando", template: "\\newcommand{\\$0}{}" },
  { label: "\\renewcommand", detail: "ridefinisce un comando" },
  { label: "\\newenvironment", detail: "nuovo ambiente" },
  { label: "\\setlength", detail: "imposta una lunghezza" },
  { label: "\\hspace", detail: "spazio orizzontale", template: "\\hspace{$0}" },
  { label: "\\vspace", detail: "spazio verticale", template: "\\vspace{$0}" },
  { label: "\\frac", detail: "frazione", template: "\\frac{$0}{}" },
  { label: "\\sqrt", detail: "radice", template: "\\sqrt{$0}" },
  { label: "\\sum", detail: "sommatoria" },
  { label: "\\prod", detail: "produttoria" },
  { label: "\\int", detail: "integrale" },
  { label: "\\lim", detail: "limite" },
  { label: "\\infty", detail: "infinito" },
  { label: "\\dots", detail: "puntini (generici)" },
  { label: "\\ldots", detail: "puntini bassi" },
  { label: "\\cdots", detail: "puntini centrati" },
  { label: "\\text", detail: "testo in modalità matematica", template: "\\text{$0}" },
  { label: "\\mathrm", detail: "romanico in matematica", template: "\\mathrm{$0}" },
  { label: "\\mathbf", detail: "grassetto in matematica", template: "\\mathbf{$0}" },
  { label: "\\mathcal", detail: "calligrafico in matematica", template: "\\mathcal{$0}" },
  { label: "\\vec", detail: "vettore", template: "\\vec{$0}" },
  { label: "\\hat", detail: "cappello", template: "\\hat{$0}" },
  { label: "\\bar", detail: "barra", template: "\\bar{$0}" },
  { label: "\\left", detail: "delimitatore sinistro adattivo" },
  { label: "\\right", detail: "delimitatore destro adattivo" },
  { label: "\\begin", detail: "apre un ambiente", template: "\\begin{$0}" },
  { label: "\\end", detail: "chiude un ambiente" },
  { label: "\\alpha", detail: "greco: alpha" },
  { label: "\\beta", detail: "greco: beta" },
  { label: "\\gamma", detail: "greco: gamma" },
  { label: "\\delta", detail: "greco: delta" },
  { label: "\\epsilon", detail: "greco: epsilon" },
  { label: "\\theta", detail: "greco: theta" },
  { label: "\\lambda", detail: "greco: lambda" },
  { label: "\\mu", detail: "greco: mu" },
  { label: "\\pi", detail: "greco: pi" },
  { label: "\\sigma", detail: "greco: sigma" },
  { label: "\\phi", detail: "greco: phi" },
  { label: "\\omega", detail: "greco: omega" },
];

interface EnvDef {
  name: string;
  detail: string;
  body?: string;
}

const ENVIRONMENTS: EnvDef[] = [
  { name: "document", detail: "radice del documento" },
  { name: "abstract", detail: "sommario dell'articolo" },
  { name: "itemize", detail: "elenco puntato", body: "\\item $0" },
  { name: "enumerate", detail: "elenco numerato", body: "\\item $0" },
  { name: "description", detail: "elenco descrittivo", body: "\\item[termine] $0" },
  { name: "center", detail: "blocco centrato" },
  { name: "flushleft", detail: "allineato a sinistra" },
  { name: "flushright", detail: "allineato a destra" },
  { name: "quote", detail: "citazione breve" },
  { name: "quotation", detail: "citazione lunga" },
  { name: "verbatim", detail: "testo non formattato" },
  { name: "equation", detail: "equazione numerata" },
  { name: "equation*", detail: "equazione non numerata" },
  { name: "align", detail: "allineamenti multipli numerati" },
  { name: "align*", detail: "allineamenti multipli non numerati" },
  { name: "gather", detail: "formule in colonna" },
  { name: "gather*", detail: "formule in colonna non numerate" },
  { name: "figure", detail: "figura flottante", body: "[htbp]\n\t\\centering\n\t% \\includegraphics[width=0.8\\linewidth]{esempio.png}\n\t\\caption{$0}\n\t\\label{fig:esempio}" },
  { name: "table", detail: "tabella flottante", body: "[htbp]\n\t\\centering\n\t\\caption{$0}\n\t\\label{tab:esempio}\n\t\\begin{tabular}{lll}\n\t\tA & B & C \\\\\n\t\t1 & 2 & 3 \\\\\n\t\\end{tabular}" },
  { name: "tabular", detail: "tabella", body: "{lll}\n\t1 & 2 & 3 \\\\\n\t$0" },
  { name: "minipage", detail: "mini pagina", body: "{$0\\linewidth}{}" },
  { name: "theorem", detail: "teorema (richiede \\newtheorem)" },
  { name: "proof", detail: "dimostrazione" },
  { name: "thebibliography", detail: "bibliografia manuale", body: "{99}\n\t\\bibitem{$0}" },
  { name: "frame", detail: "diapositiva Beamer", body: "{$0}" },
  { name: "columns", detail: "colonne Beamer" },
  { name: "figure*", detail: "figura a doppia colonna" },
  { name: "table*", detail: "tabella a doppia colonna" },
];

const BIB_ENTRY_TYPES: CmdDef[] = [
  { label: "@article", detail: "articolo su rivista", template: "@article{$0,\n\tauthor  = {},\n\ttitle   = {},\n\tjournal = {},\n\tyear    = {},\n\tvolume  = {},\n\tnumber  = {},\n\tpages   = {},\n}" },
  { label: "@book", detail: "libro", template: "@book{$0,\n\tauthor    = {},\n\ttitle     = {},\n\tpublisher = {},\n\tyear      = {},\n}" },
  { label: "@inproceedings", detail: "atto di conferenza", template: "@inproceedings{$0,\n\tauthor    = {},\n\ttitle     = {},\n\tbooktitle = {},\n\tyear      = {},\n\tpages     = {},\n}" },
  { label: "@incollection", detail: "capitolo di libro" },
  { label: "@phdthesis", detail: "tesi di dottorato" },
  { label: "@mastersthesis", detail: "tesi di laurea" },
  { label: "@techreport", detail: "rapporto tecnico" },
  { label: "@unpublished", detail: "lavoro non pubblicato" },
  { label: "@misc", detail: "voce generica" },
  { label: "@online", detail: "risorsa in linea" },
];

function commandCompletions(): Completion[] {
  return COMMANDS.map((c) => ({
    label: c.label,
    type: c.type ?? "keyword",
    detail: c.detail,
    apply: c.template ? snippet(c.template) : undefined,
  }));
}

/** `\begin{…}` completions that also close the environment. */
function envCompletions(): Completion[] {
  return ENVIRONMENTS.map((e) => {
    const body = e.body ? `${e.body}\n` : "";
    const template = `${e.name}}\n\t${body}\\end{${e.name}}`;
    return {
      label: e.name,
      type: "function",
      detail: e.detail,
      apply: snippet(template),
    };
  });
}

function bibEntryCompletions(): Completion[] {
  return BIB_ENTRY_TYPES.map((c) => ({
    label: c.label,
    type: "class",
    detail: c.detail,
    apply: c.template ? snippet(c.template) : undefined,
  }));
}

/**
 * The single completion source used by the editor. Returns `null` when the
 * context does not match anything.
 */
export function latexCompletionSource(ctx: CompletionContext): CompletionResult | null {
  const state = useAppStore.getState();
  const activePath = state.activeTabPath ?? "";
  const isBib = extname(activePath) === "bib";

  // ---- \ref{…} / \cite{…}: dynamic labels and citation keys ---------------
  const refMatch = ctx.matchBefore(
    /\\(?:ref|eqref|pageref|autoref|nameref|cite|citep|citet|parencite|textcite|footcite)\{[^}]*$/
  );
  if (refMatch) {
    const isCite = /cite/i.test(refMatch.text);
    const open = refMatch.from + refMatch.text.indexOf("{") + 1;
    const items = new Set<string>();
    for (const t of state.tabs) {
      if (isCite) {
        if (extname(t.path) === "bib") collectBibKeys(t.content).forEach((k) => items.add(k));
      } else {
        collectLabels(t.content).forEach((k) => items.add(k));
      }
    }
    return {
      from: open,
      options: [...items].map((k) => ({
        label: k,
        type: "variable",
        detail: isCite ? "chiave bibliografica" : "etichetta",
      })),
      validFor: /^[^}]*$/,
    };
  }

  // ---- BibTeX entry types --------------------------------------------------
  if (isBib) {
    const atMatch = ctx.matchBefore(/@[a-zA-Z]*$/);
    if (atMatch) {
      return { from: atMatch.from, options: bibEntryCompletions(), validFor: /^@?[a-zA-Z]*$/ };
    }
    return null;
  }

  if (!isLatexLike(activePath)) return null;

  // ---- \begin{…} ------------------------------------------------------------
  const beginMatch = ctx.matchBefore(/\\begin\{[^}]*$/);
  if (beginMatch) {
    const open = beginMatch.from + beginMatch.text.indexOf("{") + 1;
    return { from: open, options: envCompletions(), validFor: /^[^}]*$/ };
  }

  // ---- \end{…}: environments used in the document --------------------------
  const endMatch = ctx.matchBefore(/\\end\{[^}]*$/);
  if (endMatch) {
    const open = endMatch.from + endMatch.text.indexOf("{") + 1;
    const envs = new Set<string>();
    for (const t of state.tabs) {
      const re = /\\begin\{([^}]+)\}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(t.content)) !== null) envs.add(m[1]);
    }
    for (const e of ENVIRONMENTS) envs.add(e.name);
    return {
      from: open,
      options: [...envs].map((e) => ({ label: e, type: "function" })),
      validFor: /^[^}]*$/,
    };
  }

  // ---- \commands ------------------------------------------------------------
  const cmdMatch = ctx.matchBefore(/\\[a-zA-Z@]*$/);
  if (cmdMatch) {
    return { from: cmdMatch.from, options: commandCompletions(), validFor: /^\\?[a-zA-Z@]*$/ };
  }

  return null;
}

/**
 * Completamento LaTeX sensibile al contesto:
 * - comandi comuni e snippet dopo `\`;
 * - nomi ambiente dentro \begin{ / \end{;
 * - \ref/\cite con etichette e chiavi bibliografiche reali del progetto;
 * - \input/\include con i file .tex del progetto;
 * - \includegraphics con le immagini del progetto;
 * - \bibliographystyle con gli stili comuni.
 */
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { KNOWN_ENVS } from './envList';
import { SNIPPETS } from './snippets';
import { useProjectStore } from '../../state/useProjectStore';
import { extOf } from '../../utils/paths';
import type { FileNode } from '../../utils/ipc';

/** Comandi comuni: [comando, dettaglio]. */
const COMMAND_DATA: ReadonlyArray<readonly [string, string]> = [
  ['\\textbf', 'grassetto'],
  ['\\textit', 'corsivo'],
  ['\\emph', 'enfasi'],
  ['\\underline', 'sottolineato'],
  ['\\texttt', 'monospazio'],
  ['\\textrm', 'tondo'],
  ['\\textsf', 'senza grazie'],
  ['\\textsc', 'maiuscoletto'],
  ['\\section', 'sezione'],
  ['\\subsection', 'sottosezione'],
  ['\\subsubsection', 'sottosottosezione'],
  ['\\paragraph', 'paragrafo'],
  ['\\title', 'titolo'],
  ['\\author', 'autore'],
  ['\\date', 'data'],
  ['\\maketitle', 'compone il titolo'],
  ['\\tableofcontents', 'indice'],
  ['\\listoffigures', 'elenco figure'],
  ['\\listoftables', 'elenco tabelle'],
  ['\\appendix', 'inizio appendice'],
  ['\\label', 'etichetta'],
  ['\\ref', 'riferimento'],
  ['\\eqref', 'riferimento equation'],
  ['\\pageref', 'riferimento a pagina'],
  ['\\autoref', 'riferimento automatico (hyperref)'],
  ['\\cite', 'citazione'],
  ['\\citep', 'citazione parentetica (natbib)'],
  ['\\citet', 'citazione testuale (natbib)'],
  ['\\footnote', 'nota a piè di pagina'],
  ['\\usepackage', 'importa pacchetto'],
  ['\\bibliography', 'file bibliografia'],
  ['\\bibliographystyle', 'stile bibliografia'],
  ['\\newcommand', 'nuovo comando'],
  ['\\renewcommand', 'ridefinisci comando'],
  ['\\providecommand', 'comando se assente'],
  ['\\newtheorem', 'nuovo teorema'],
  ['\\item', 'voce di elenco'],
  ['\\include', 'include file (con .aux)'],
  ['\\input', 'input file'],
  ['\\includegraphics', 'immagine (graphicx)'],
  ['\\caption', 'didascalia'],
  ['\\centering', 'centra'],
  ['\\hline', 'linea orizzontale tabella'],
  ['\\cline', 'linea parziale tabella'],
  ['\\hfill', 'riempimento orizzontale'],
  ['\\vfill', 'riempimento verticale'],
  ['\\hspace', 'spazio orizzontale'],
  ['\\vspace', 'spazio verticale'],
  ['\\newpage', 'nuova pagina'],
  ['\\clearpage', 'chiudi pagina float'],
  ['\\cleardoublepage', 'chiudi pagina pari'],
  ['\\pagebreak', 'interruzione di pagina'],
  ['\\linebreak', 'interruzione di riga'],
  ['\\mbox', 'scatola inseparabile'],
  ['\\fbox', 'cornice'],
  ['\\parbox', 'paragrafo in scatola'],
  ['\\rule', 'linea/regola'],
  ['\\phantom', 'spazio fantasma'],
  ['\\ensuremath', 'matematica ovunque'],
  ['\\verb', 'testo letterale'],
  ['\\url', 'URL (hyperref)'],
  ['\\footnotesize', 'corpo piccolissimo'],
  ['\\scriptsize', 'corpo minuscolo'],
  ['\\small', 'corpo piccolo'],
  ['\\normalsize', 'corpo normale'],
  ['\\large', 'corpo grande'],
  ['\\Large', 'corpo più grande'],
  ['\\LARGE', 'corpo molto grande'],
  ['\\huge', 'corpo enorme'],
  ['\\Huge', 'corpo gigante'],
  ['\\alpha', 'α'],
  ['\\beta', 'β'],
  ['\\gamma', 'γ'],
  ['\\delta', 'δ'],
  ['\\epsilon', 'ε'],
  ['\\zeta', 'ζ'],
  ['\\theta', 'θ'],
  ['\\lambda', 'λ'],
  ['\\mu', 'μ'],
  ['\\pi', 'π'],
  ['\\sigma', 'σ'],
  ['\\phi', 'φ'],
  ['\\omega', 'ω'],
  ['\\sum', 'sommatoria'],
  ['\\prod', 'prodotto'],
  ['\\int', 'integrale'],
  ['\\sqrt', 'radice'],
  ['\\text', 'testo in matematica'],
  ['\\mathrm', 'tondo in matematica'],
  ['\\mathbf', 'grassetto in matematica'],
  ['\\mathit', 'corsivo in matematica'],
  ['\\vec', 'vettore'],
  ['\\hat', 'cappello'],
  ['\\bar', 'barra'],
  ['\\dot', 'punto'],
  ['\\ddot', 'doppio punto'],
  ['\\tilde', 'tilde'],
  ['\\left', 'delimitatore sinistro'],
  ['\\right', 'delimitatore destro'],
  ['\\ldots', 'puntini bassi'],
  ['\\cdots', 'puntini centrati'],
  ['\\dots', 'puntini'],
];

const COMMAND_COMPLETIONS: Completion[] = COMMAND_DATA.map(([label, detail]) => ({
  label,
  detail,
  type: 'function',
}));

const ENV_COMPLETIONS: Completion[] = KNOWN_ENVS.map((e) => ({
  label: e.name,
  detail: e.detail,
  type: 'class',
}));

const BIB_STYLES: Completion[] = ['plain', 'abbrv', 'alpha', 'unsrt', 'ieeetr', 'acm', 'apalike', 'siam'].map(
  (s) => ({ label: s, type: 'class', detail: 'stile bibliografia' }),
);

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'eps', 'pdf']);

function flattenFiles(node: FileNode | null, pred: (rel: string) => boolean): string[] {
  const out: string[] = [];
  const walk = (n: FileNode | null) => {
    if (!n || out.length > 2000) return;
    if (n.kind === 'file') {
      if (pred(n.path)) out.push(n.path);
    } else {
      n.children?.forEach(walk);
    }
  };
  walk(node);
  return out;
}

function labelsCompletions(): Completion[] {
  const labels = useProjectStore.getState().labels;
  if (!labels || labels.labels.length === 0) return [];
  return labels.labels.slice(0, 500).map((l) => ({
    label: l.name,
    detail: `${l.file}:${l.line}`,
    type: 'variable',
  }));
}

function bibCompletions(): Completion[] {
  const labels = useProjectStore.getState().labels;
  if (!labels || labels.bibKeys.length === 0) return [];
  return labels.bibKeys.slice(0, 500).map((b) => ({
    label: b.key,
    detail: `${b.file}:${b.line}`,
    type: 'constant',
  }));
}

function fileCompletions(pred: (rel: string) => boolean): Completion[] {
  const tree = useProjectStore.getState().tree;
  return flattenFiles(tree, pred)
    .slice(0, 400)
    .map((p) => ({ label: p, type: 'file' }));
}

function opts(options: Completion[], from: number, validFor: RegExp): CompletionResult | null {
  if (options.length === 0) return null;
  return { from, options, validFor };
}

export function latexCompletionSource(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);

  // \begin{amb / \end{amb
  let m = /\\(begin|end)\{([A-Za-z*-]*)$/.exec(before);
  if (m) {
    return opts(ENV_COMPLETIONS, context.pos - m[2].length, /^[A-Za-z*-]*$/);
  }

  // \ref{...} e varianti → etichette
  m = /\\(ref|eqref|pageref|autoref|vref|cref|Cref)\{([^}]*)$/.exec(before);
  if (m) {
    return opts(labelsCompletions(), context.pos - m[2].length, /^[^}]*$/);
  }

  // \cite{...} e varianti → chiavi bibliografiche
  m = /\\(cite|citep|citet|citeauthor|citeyear|textcite|parencite|footcite|citealt|citealp)\*?\{([^}]*)$/.exec(before);
  if (m) {
    return opts(bibCompletions(), context.pos - m[2].length, /^[^},]*$/);
  }

  // \includegraphics{ → immagini del progetto
  m = /\\includegraphics\*?(?:\[[^\]]*\])?\{([^}]*)$/.exec(before);
  if (m) {
    return opts(
      fileCompletions((rel) => IMAGE_EXTS.has(extOf(rel))),
      context.pos - m[1].length,
      /^[^}]*$/,
    );
  }

  // \input{ / \include{ → file .tex
  m = /\\(input|include)\{([^}]*)$/.exec(before);
  if (m) {
    return opts(
      fileCompletions((rel) => extOf(rel) === 'tex'),
      context.pos - m[2].length,
      /^[^}]*$/,
    );
  }

  // \bibliography{ → file .bib
  m = /\\bibliography\{([^}]*)$/.exec(before);
  if (m) {
    return opts(
      fileCompletions((rel) => extOf(rel) === 'bib'),
      context.pos - m[1].length,
      /^[^}]*$/,
    );
  }

  // \bibliographystyle{ → stili comuni
  m = /\\bibliographystyle\{([^}]*)$/.exec(before);
  if (m) {
    return opts(BIB_STYLES, context.pos - m[1].length, /^[^}]*$/);
  }

  // comando generico dopo '\'
  m = /\\([A-Za-z]*)$/.exec(before);
  if (m) {
    // il range include il backslash: le label contengono già '\comando'
    const from = context.pos - m[1].length - 1;
    return opts([...COMMAND_COMPLETIONS, ...SNIPPETS], from, /^\\[A-Za-z]*$/);
  }

  return null;
}

/** Snippet LaTeX originali (espansione con cursor-stop, CodeMirror). */
import { snippet, type Completion } from '@codemirror/autocomplete';

/**
 * Nota: dentro gli snippet i segnaposto sono `${nome}`; il testo LaTeX è
 * letterale (nessun `$` matematico usato negli snippet per evitare escape).
 */
export const SNIPPETS: Completion[] = [
  {
    label: '\\documento',
    type: 'snippet',
    detail: 'scaffold documento completo',
    apply: snippet(
      '\\documentclass{${classe}}\n\n\\begin{document}\n\t${contenuto}\n\\end{document}',
    ),
  },
  {
    label: '\\documentclass',
    type: 'snippet',
    detail: 'riga documentclass',
    apply: snippet('\\documentclass{${classe}}'),
  },
  {
    label: '\\begin{…}',
    type: 'snippet',
    detail: 'ambiente begin/end',
    apply: snippet('\\begin{${ambiente}}\n\t${contenuto}\n\\end{${ambiente}}'),
  },
  {
    label: '\\figure',
    type: 'snippet',
    detail: 'figura con caption e label',
    apply: snippet(
      '\\begin{figure}[${posizione}]\n\t\\centering\n\t\\includegraphics[width=${larghezza}\\linewidth]{${file}}\n\t\\caption{${didascalia}}\n\t\\label{fig:${etichetta}}\n\\end{figure}',
    ),
  },
  {
    label: '\\table',
    type: 'snippet',
    detail: 'tabella con tabular',
    apply: snippet(
      '\\begin{table}[${posizione}]\n\t\\centering\n\t\\begin{tabular}{${colonne}}\n\t\t${prima} & ${seconda} \\\\\n\t\t\\hline\n\t\\end{tabular}\n\t\\caption{${didascalia}}\n\t\\label{tab:${etichetta}}\n\\end{table}',
    ),
  },
  {
    label: '\\itemize',
    type: 'snippet',
    detail: 'elenco puntato',
    apply: snippet('\\begin{itemize}\n\t\\item ${elemento}\n\\end{itemize}'),
  },
  {
    label: '\\enumerate',
    type: 'snippet',
    detail: 'elenco numerato',
    apply: snippet('\\begin{enumerate}\n\t\\item ${elemento}\n\\end{enumerate}'),
  },
  {
    label: '\\equation',
    type: 'snippet',
    detail: 'equazione numerata con label',
    apply: snippet('\\begin{equation}\n\t\\label{eq:${etichetta}}\n\t${formula}\n\\end{equation}'),
  },
  {
    label: '\\align',
    type: 'snippet',
    detail: 'allineamenti numerati',
    apply: snippet(
      '\\begin{align}\n\t\\label{eq:${etichetta}}\n\t${sinistra} &= ${destra} \\\\\n\\end{align}',
    ),
  },
  {
    label: '\\section',
    type: 'snippet',
    detail: 'sezione con label',
    apply: snippet('\\section{${titolo}}\\label{sec:${etichetta}}'),
  },
  {
    label: '\\subsection',
    type: 'snippet',
    detail: 'sottosezione con label',
    apply: snippet('\\subsection{${titolo}}\\label{sub:${etichetta}}'),
  },
  {
    label: '\\abstract',
    type: 'snippet',
    detail: 'ambiente abstract',
    apply: snippet('\\begin{abstract}\n\t${testo}\n\\end{abstract}'),
  },
  {
    label: '\\bibitem',
    type: 'snippet',
    detail: 'voce bibliografia manuale',
    apply: snippet('\\bibitem{${etichetta}} ${autore}: \\emph{${titolo}}, ${anno}.'),
  },
  {
    label: '\\frame',
    type: 'snippet',
    detail: 'frame beamer',
    apply: snippet('\\begin{frame}{${titolo}}\n\t${contenuto}\n\\end{frame}'),
  },
  {
    label: '\\frac',
    type: 'snippet',
    detail: 'frazione',
    apply: snippet('\\frac{${numeratore}}{${denominatore}}'),
  },
  {
    label: '\\href',
    type: 'snippet',
    detail: 'link (richiede hyperref)',
    apply: snippet('\\href{${url}}{${testo}}'),
  },
];

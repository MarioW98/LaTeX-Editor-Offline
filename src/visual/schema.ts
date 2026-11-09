import { Schema } from "@tiptap/pm/model";

/**
 * M1 — Schema ProseMirror della vista visuale.
 *
 * Il sorgente LaTeX è l'unica verità del documento: questo schema modella la
 * vista DERIVATA dal parse (`latexToDoc`) e riconvertita dal serialize
 * (`docToLatex`). Ogni costrutto che il subset V1 non supporta non viene
 * interpretato: vive in un nodo «chip» che porta la slice VERBATIM del
 * sorgente nell'attributo `latex` e viene riscritto byte per byte.
 *
 * Nodi:
 *   - `preamble` / `postamble`: chip atomici di testa (tutto ciò che precede
 *     \begin{document}) e coda (tutto ciò che segue \end{document}).
 *   - `rawBlock` / `rawInline`: chip di costrutti non supportati, block-level
 *     (equation, align, tikzpicture, tabular, commenti isolati, \[...\]) o
 *     inline ($...$, \footnote, \ref, \cite, comandi non riconosciuti).
 *   - `verbatim`: blocco monospace EDITABILE (\begin{verbatim}).
 *   - `heading`: \section / \subsection / \subsubsection, anche nella forma *.
 *   - paragrafi, liste itemize/enumerate annidate, citazioni (\begin{quote}).
 *
 * Marche: \textbf → bold, \emph/\textit → italic, \underline → underline,
 * \texttt → code.
 *
 * Lo schema è volutamente IDENTICO a quello che gli extension TipTap di
 * src/editor/ derivano dagli stessi nomi di nodo: il JSON prodotto dal
 * motore puro deve essere accettato tale e quale dall'editor visuale, e il
 * JSON restituito dall'editor deve tornare byte per byte al motore.
 */
export const visualSchema = new Schema({
  nodes: {
    doc: {
      content: "preamble? block* postamble?",
    },
    // Chip di testa: slice verbatim dall'inizio del file fino a \begin{document}.
    preamble: {
      attrs: { latex: { default: "" } },
      atom: true,
      defining: true,
    },
    // Chip di coda: slice verbatim dopo \end{document} (spesso solo il newline
    // finale del file: anche quello va preservato byte per byte).
    postamble: {
      attrs: { latex: { default: "" } },
      atom: true,
      defining: true,
    },
    paragraph: {
      content: "inline*",
      group: "block",
    },
    heading: {
      attrs: {
        level: { default: 1 },
        starred: { default: false },
      },
      content: "inline*",
      group: "block",
      defining: true,
    },
    bulletList: {
      content: "listItem+",
      group: "block",
    },
    orderedList: {
      content: "listItem+",
      group: "block",
    },
    listItem: {
      content: "paragraph block*",
      defining: true,
    },
    blockquote: {
      content: "block+",
      group: "block",
      defining: true,
    },
    // \begin{verbatim}: contenuto EDITABILE, nessuna interpretazione, nessuna
    // marca dentro (i "code block" di ProseMirror).
    verbatim: {
      content: "text*",
      marks: "",
      code: true,
      group: "block",
      defining: true,
    },
    // Blocco LaTeX grezzo non supportato: slice verbatim, atomico, read-only.
    rawBlock: {
      attrs: { latex: { default: "" } },
      atom: true,
      group: "block",
      defining: true,
    },
    text: {
      group: "inline",
    },
    // Chip inline LaTeX grezzo: slice verbatim, atomico, read-only.
    rawInline: {
      attrs: { latex: { default: "" } },
      inline: true,
      atom: true,
      group: "inline",
    },
  },
  marks: {
    bold: {},
    italic: {},
    underline: {},
    code: {},
  },
});

/** JSON di una marca ProseMirror (forma prodotta da Node.toJSON()/TipTap). */
export interface JsonMark {
  type: string;
  attrs?: Record<string, unknown>;
}

/** JSON di un nodo ProseMirror (forma prodotta da Node.toJSON() e da TipTap). */
export interface DocJson {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocJson[];
  text?: string;
  marks?: JsonMark[];
}

/**
 * Valida un documento JSON contro lo schema visuale e lo restituisce nella
 * forma canonica di Node.toJSON() (attributi uguali al default omessi).
 * Solleva un errore se la struttura non rispetta lo schema: i bug del motore
 * emergono nei test, mai come documento silenziosamente malformato.
 */
export function validaDocJson(doc: DocJson): DocJson {
  return visualSchema.nodeFromJSON(doc).toJSON() as DocJson;
}

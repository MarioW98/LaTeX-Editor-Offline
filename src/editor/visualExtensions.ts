import { Node, mergeAttributes } from "@tiptap/core";
import type { Extensions } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Heading from "@tiptap/extension-heading";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Underline from "@tiptap/extension-underline";
import Code from "@tiptap/extension-code";
import BulletList from "@tiptap/extension-bullet-list";
import OrderedList from "@tiptap/extension-ordered-list";
import ListItem from "@tiptap/extension-list-item";
import Blockquote from "@tiptap/extension-blockquote";
import History from "@tiptap/extension-history";

/**
 * M1 — Extension TipTap della vista visuale.
 *
 * Lo schema che questi extension derivano è IDENTICO a src/visual/schema.ts
 * (stessi nomi di nodo, stessi attributi): il JSON prodotto dal motore puro
 * (latexToDoc) entra tale e quale nell'editor, e il JSON dell'editor
 * (getJSON) torna tale e quale al serializzatore (docToLatex). Il test di
 * integrazione EditorPane.toggle.test.ts inchioda questo contratto.
 *
 * I chip (preamble, postamble, rawBlock, rawInline) sono nodi ATOMICI
 * read-only: la slice verbatim vive nell'attributo `latex` e viene resa
 * tale e quale. Nessun NodeView React serve: il renderHTML statico basta
 * perché l'attributo non cambia mai dall'interno dell'editor.
 */

/** Attributi condivisi da tutti i chip: la slice VERBATIM del sorgente. */
function attributiChip() {
  return {
    latex: {
      default: "",
      parseHTML: (element: HTMLElement) => element.textContent ?? "",
      renderHTML: () => ({} as Record<string, string>),
    },
  };
}

/** Documento: preambolo in testa, coda in fondo, blocchi nel mezzo. */
const DocumentoVisuale = Document.extend({
  content: "preamble? block* postamble?",
});

/** Chip del preambolo: tutto ciò che precede \begin{document}. */
const Preambolo = Node.create({
  name: "preamble",
  atom: true,
  defining: true,
  addAttributes() {
    return attributiChip();
  },
  parseHTML() {
    return [{ tag: "pre[data-preamble]" }];
  },
  renderHTML({ node }) {
    return [
      "pre",
      mergeAttributes({ "data-preamble": "true" }, { class: "chip-blocco chip-preambolo" }),
      node.attrs.latex as string,
    ];
  },
});

/** Chip di coda: tutto ciò che segue \end{document}. */
const Postambolo = Node.create({
  name: "postamble",
  atom: true,
  defining: true,
  addAttributes() {
    return attributiChip();
  },
  parseHTML() {
    return [{ tag: "pre[data-postambio]" }];
  },
  renderHTML({ node }) {
    return [
      "pre",
      mergeAttributes({ "data-postambio": "true" }, { class: "chip-blocco chip-postambio" }),
      node.attrs.latex as string,
    ];
  },
});

/** Chip di blocco LaTeX grezzo (equation, tikzpicture, commenti isolati…). */
const BloccoGrezzo = Node.create({
  name: "rawBlock",
  group: "block",
  atom: true,
  defining: true,
  addAttributes() {
    return attributiChip();
  },
  parseHTML() {
    return [{ tag: "pre[data-raw-blocco]" }];
  },
  renderHTML({ node }) {
    return [
      "pre",
      mergeAttributes({ "data-raw-blocco": "true" }, { class: "chip-blocco" }),
      node.attrs.latex as string,
    ];
  },
});

/** Chip inline LaTeX grezzo ($...$, \footnote, \ref…), read-only. */
const InlineGrezzo = Node.create({
  name: "rawInline",
  inline: true,
  atom: true,
  group: "inline",
  addAttributes() {
    return attributiChip();
  },
  parseHTML() {
    return [{ tag: "code[data-raw]" }];
  },
  renderHTML({ node }) {
    return [
      "code",
      mergeAttributes({ "data-raw": "true" }, { class: "chip-inline" }),
      node.attrs.latex as string,
    ];
  },
});

/** Blocco verbatim (\begin{verbatim}): monospace, EDITABILE. */
const Verbatim = Node.create({
  name: "verbatim",
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  defining: true,
  parseHTML() {
    return [{ tag: "pre[data-verbatim]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "pre",
      mergeAttributes(HTMLAttributes, { "data-verbatim": "true", class: "blocco-verbatim" }),
      ["code", 0],
    ];
  },
  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor.commands.newlineInCode(),
    };
  },
});

/** Titolo con la stellina (\section*): estende Heading con `starred`. */
const Titolo = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      starred: {
        default: false,
        parseHTML: (element: HTMLElement) => element.hasAttribute("data-stellina"),
        renderHTML: (attributi: { starred: boolean }) =>
          attributi.starred ? { "data-stellina": "true" } : {},
      },
    };
  },
});

/** Contenuto del blocco «LaTeX grezzo» inserito dalla toolbar. */
export const TEMPLATE_BLOCCO_GREZZO = "% LaTeX grezzo";

/** Tutte le extension della vista visuale, nell'ordine del motore. */
export function visualExtensions(): Extensions {
  return [
    DocumentoVisuale,
    Paragraph,
    Text,
    Titolo,
    Bold,
    Italic,
    Underline,
    Code,
    BulletList,
    OrderedList,
    ListItem,
    Blockquote,
    History,
    Preambolo,
    Postambolo,
    BloccoGrezzo,
    InlineGrezzo,
    Verbatim,
  ];
}

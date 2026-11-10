import { Node, mergeAttributes } from "@tiptap/core";
import type { Extensions, NodeViewRendererProps } from "@tiptap/core";
import type { NodeView } from "@tiptap/pm/view";
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
import { estraiMatematica, renderMatematica } from "../visual/math.ts";

/**
 * M2 — Vista DOM di un chip grezzo (inline o blocco).
 *
 * Se la slice VERBATIM è matematica che KaTeX sa rendere, il DOM mostra la
 * formula RESA: la resa vive SOLO nel DOM (title col sorgente verbatim al
 * passaggio del mouse). In ogni altro caso — chip non matematico, oppure
 * matematica che KaTeX rifiuta — il chip grezzo di sempre: monospace, bordo,
 * slice tale e quale.
 *
 * renderHTML e il modello NON cambiano: la serializzazione (clipboard, HTML)
 * passa sempre dal renderHTML statico di M1, il round-trip byte per byte
 * resta quello che era. Il nodo resta atomico e read-only: qui dentro non si
 * tocca il documento, si mostra.
 */
function vistaChipGrezzo(
  tag: "code" | "pre",
  attributoSelettore: string,
  classeGrezzo: string,
): (props: NodeViewRendererProps) => NodeView {
  return ({ node }) => {
    const latex = typeof node.attrs.latex === "string" ? node.attrs.latex : "";
    const dom = document.createElement(tag);
    dom.setAttribute(attributoSelettore, "true");

    const matematica = estraiMatematica(latex);
    if (matematica !== null) {
      const esito = renderMatematica(matematica.tex, matematica.display);
      if ("html" in esito) {
        dom.className = `${classeGrezzo} chip-matematica`;
        dom.setAttribute("data-matematica", "true");
        // Il sorgente verbatim resta raggiungibile: tooltip al passaggio del
        // mouse (la modifica avviene in Sorgente, come per ogni chip).
        dom.setAttribute("title", latex);
        dom.innerHTML = esito.html;
        return conSelezione(dom);
      }
    }
    // Fallback: identico al renderHTML statico (stesso elemento, stessi
    // attributi, stessa slice come testo).
    dom.className = classeGrezzo;
    dom.textContent = latex;
    return conSelezione(dom);
  };
}

/** Nodo selezionato: la classe standard di ProseMirror, come faceva il
 * renderHTML statico prima delle node view (nessun passo indietro). */
function conSelezione(dom: HTMLElement): NodeView {
  return {
    dom,
    selectNode() {
      dom.classList.add("ProseMirror-selectednode");
    },
    deselectNode() {
      dom.classList.remove("ProseMirror-selectednode");
    },
  };
}

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

/** Chip di blocco LaTeX grezzo (equation, tikzpicture, commenti isolati…):
 *  la matematica display (ambienti amsmath, \[...\], $$...$$) si vede resa. */
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
  addNodeView() {
    return vistaChipGrezzo("pre", "data-raw-blocco", "chip-blocco");
  },
});

/** Chip inline LaTeX grezzo ($...$, \footnote, \ref…), read-only:
 *  la matematica inline ($...$, \(...\)) si vede resa. */
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
  addNodeView() {
    return vistaChipGrezzo("code", "data-raw", "chip-inline");
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

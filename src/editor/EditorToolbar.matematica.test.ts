/**
 * M2 — Test della toolbar con un editor TipTap montato direttamente: la
 * resa matematica NON cambia le regole della toolbar (stesso runner: node
 * --test, ambiente happy-dom).
 *
 * Con la selezione DENTRO un chip matematico reso (node view di M2) i bottoni
 * di formattazione restano DISABILITATI, esattamente come nei chip grezzi di
 * M1: la matematica resa è pur sempre un chip read-only, il LaTeX non si
 * tocca dalla toolbar. Con la selezione nel testo normale i bottoni sono
 * attivi. Il nodo selezionato mostra la classe standard di ProseMirror.
 */
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// 1. DOM fittizio nei globali, prima di qualunque modulo che guardi il DOM.
const { Window } = await import("happy-dom");
const finestra = new Window();
const globali = globalThis as unknown as Record<string, unknown>;
globali.window = finestra;
globali.document = finestra.document;
Object.defineProperty(globalThis, "navigator", {
  value: finestra.navigator,
  configurable: true,
  writable: true,
});
globali.MutationObserver = finestra.MutationObserver;
globali.DOMParser = finestra.DOMParser;
globali.getComputedStyle = finestra.getComputedStyle;
globali.getSelection = finestra.getSelection;
globali.requestAnimationFrame = (callback: FrameRequestCallback) =>
  setTimeout(() => callback(Date.now()), 0);
globali.cancelAnimationFrame = (id: number) => clearTimeout(id);
globali.IS_REACT_ACT_ENVIRONMENT = true;

// 2. Hook per .tsx (JSX) e .css (stub) — vedi testCaricatore.mjs.
register("./testCaricatore.mjs", import.meta.url);

// 3. I moduli reali, DOPO globali e hook.
const React = await import("react");
const ReactDOMClient = await import("react-dom/client");
const { Editor } = await import("@tiptap/core");
const { visualExtensions } = await import("./visualExtensions.ts");
const { EditorToolbar } = await import("./EditorToolbar.tsx");

/** Documento di prova: paragrafo con chip matematico inline e blocco display. */
const CONTENUTO = {
  type: "doc",
  content: [
    { type: "preamble", attrs: { latex: "" } },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "formula " },
        { type: "rawInline", attrs: { latex: "$E = mc^2$" } },
        { type: "text", text: " e basta." },
      ],
    },
    { type: "rawBlock", attrs: { latex: "\\begin{align}\na &= b\n\\end{align}" } },
    { type: "postamble", attrs: { latex: "" } },
  ],
};

let editor: InstanceType<typeof Editor> | null = null;
let contenitore: HTMLElement | null = null;
let root: ReturnType<typeof ReactDOMClient.createRoot> | null = null;

/** Monta l'editor e la toolbar; renderizza React tra le transazioni. */
async function monta() {
  const ospite = finestra.document.createElement("div");
  finestra.document.body.appendChild(ospite);
  editor = new Editor({
    extensions: visualExtensions(),
    content: CONTENUTO,
    element: ospite,
  });
  contenitore = finestra.document.createElement("div");
  finestra.document.body.appendChild(contenitore);
  root = ReactDOMClient.createRoot(contenitore);
  await React.act(async () => {
    root?.render(React.createElement(EditorToolbar, { editor }));
  });
}

/** (Ri)renderizza la toolbar dentro React.act per vedere la selezione nuova. */
async function riRender() {
  await React.act(async () => {
    root?.render(React.createElement(EditorToolbar, { editor }));
  });
}

before(async () => {
  await monta();
});

after(async () => {
  await React.act(async () => {
    root?.unmount();
  });
  root = null;
  editor?.destroy();
  editor = null;
  while (finestra.document.body.firstChild) {
    finestra.document.body.removeChild(finestra.document.body.firstChild);
  }
  contenitore = null;
  finestra.close();
});

/** Posizione del primo nodo di un dato tipo nel documento. */
function posizioneDi(tipo: string): number {
  let trovata = -1;
  editor?.state.doc.descendants((nodo, pos) => {
    if (trovata < 0 && nodo.type.name === tipo) trovata = pos;
    return true;
  });
  assert.ok(trovata >= 0, `nodo ${tipo} non trovato nel documento`);
  return trovata;
}

function bottoni(): HTMLElement[] {
  return Array.from((contenitore as HTMLElement).querySelectorAll("button"));
}

test("la node view matematica renderizza KaTeX nel DOM dell'editor", () => {
  assert.ok(editor !== null, "l'editor non esiste");
  assert.ok(editor.view.dom.isConnected, "l'editor non è montato nel documento");
  const resi = Array.from(finestra.document.querySelectorAll("[data-matematica]"));
  assert.equal(resi.length, 2, "attesi il chip inline e il blocco display resi");
  for (const chip of resi) {
    assert.ok(chip.querySelector(".katex") !== null, "il chip non contiene la struttura KaTeX");
    assert.ok((chip.getAttribute("title") ?? "").length > 0, "manca il sorgente verbatim nel tooltip");
  }
});

test("selezione dentro il chip matematico: bottoni disabilitati, classe di selezione visibile", async () => {
  // Selezione del nodo chip matematico inline (comando, come fa il click).
  editor?.commands.focus();
  editor?.commands.setNodeSelection(posizioneDi("rawInline"));
  await riRender();

  const disabilitati = bottoni().filter((b) => (b as HTMLButtonElement).disabled);
  assert.ok(bottoni().length > 0, "nessun bottone nella toolbar");
  assert.equal(disabilitati.length, bottoni().length, "i bottoni non si disabilitano dentro il chip matematico");

  // Il nodo selezionato mostra la classe standard di ProseMirror.
  const selezionato = finestra.document.querySelector(".ProseMirror-selectednode");
  assert.ok(selezionato !== null, "la node view non mostra la selezione del nodo");
  assert.equal(selezionato.getAttribute("data-matematica"), "true", "selezionato non è il chip matematico");
});

test("selezione nel testo normale: bottoni attivi", async () => {
  editor?.commands.focus();
  // Dentro il paragrafo (posizione del paragrafo + 1), non a livello documento.
  editor?.commands.setTextSelection(posizioneDi("paragraph") + 1);
  await riRender();

  const attivi = bottoni().filter((b) => !(b as HTMLButtonElement).disabled);
  assert.equal(attivi.length, bottoni().length, "i bottoni restano disabilitati fuori dai chip");
});

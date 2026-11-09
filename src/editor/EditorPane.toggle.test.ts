/**
 * M1 — Test d'integrazione del toggle Visuale/Sorgente nel flusso reale
 * dell'editor (stesso runner degli altri test: node --test).
 *
 * Render di EditorPane → click su «Visuale» → l'editor TipTap monta con il
 * documento della fixture (titoli, chip grezzi, toolbar) → click su
 * «Sorgente» → il buffer torna IDENTICO byte per byte e il documento NON
 * risulta sporco: il toggle senza modifiche è un'operazione innocua.
 *
 * Ambiente DOM: happy-dom (MIT, devDependency), con i globali installati
 * PRIMA degli import dinamici dei componenti. Gli .tsx passano dall'hook
 * testCaricatore.mjs (esbuild); i .ts girano nativi con strip-types.
 */
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// 1. DOM fittizio nei globali, prima di qualunque modulo che guardi il DOM.
const { Window } = await import("happy-dom");
const finestra = new Window();
const globali = globalThis as unknown as Record<string, unknown>;
globali.window = finestra;
globali.document = finestra.document;
// Node ≥ 22 espone navigator come proprietà di sola lettura: serve il
// defineProperty per sostituirlo con quello di happy-dom.
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

// 3. I moduli del flusso reale, DOPO globali e hook.
const React = await import("react");
const ReactDOMClient = await import("react-dom/client");
const { EditorPane } = await import("./EditorPane.tsx");
const { useStore } = await import("../state/store.ts");
const { DEFAULT_PROJECT_SETTINGS } = await import("../types.ts");

// La fixture letta dal disco viene normalizzata a LF: il test deve dipendere
// dal CONTENUTO, non dal fine riga del worktree (CRLF su Windows con
// core.autocrlf). Il flusso reale su sorgente CRLF ha il suo test qui sotto.
const FIXTURE = readFileSync(new URL("../visual/fixtures/documento.tex", import.meta.url), "utf8").replace(
  /\r\n/g,
  "\n",
);

let contenitore: HTMLElement | null = null;
let root: ReturnType<typeof ReactDOMClient.createRoot> | null = null;

function semiStore(sorgente: string) {
  useStore.setState({
    rootPath: "/tmp/progetto-fittizio",
    settings: { ...DEFAULT_PROJECT_SETTINGS, autoSave: true },
    tabs: [{ path: "main.tex" }],
    activeTab: "main.tex",
    buffers: { "main.tex": sorgente },
    dirty: {},
    binaryPaths: {},
    editorMode: "sorgente",
    visualDoc: null,
    visualError: null,
  });
}

/** Click su un bottone dentro l'albero React. */
async function click(bottone: HTMLElement) {
  await React.act(async () => {
    bottone.dispatchEvent(
      new finestra.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
}

function bottoneConTesto(testo: string): HTMLElement {
  const trovato = Array.from(
    (contenitore as HTMLElement).querySelectorAll("button"),
  ).find((b) => b.textContent === testo);
  assert.ok(trovato !== undefined, `bottone «${testo}» non trovato`);
  return trovato as HTMLElement;
}

before(async () => {
  contenitore = finestra.document.createElement("div");
  finestra.document.body.appendChild(contenitore);
  root = ReactDOMClient.createRoot(contenitore);
});

after(async () => {
  await React.act(async () => {
    root?.unmount();
  });
  root = null;
  contenitoriPulizia();
  finestra.close();
});

function contenitoriPulizia() {
  while (finestra.document.body.firstChild) {
    finestra.document.body.removeChild(finestra.document.body.firstChild);
  }
  contenitore = null;
}

test("render → Visuale → Sorgente: il documento torna identico, nessun dirty", async () => {
  semiStore(FIXTURE);
  await React.act(async () => {
    root?.render(React.createElement(EditorPane));
  });

  // In Sorgente c'è CodeMirror, niente toolbar, niente ProseMirror.
  assert.ok(contenitore?.querySelector(".cm-editor"), "CodeMirror non montato in Sorgente");
  assert.equal(contenitore?.querySelector('[role="toolbar"]'), null);
  assert.equal(contenitore?.querySelector(".ProseMirror"), null);

  // Click su «Visuale»: parse del buffer e montaggio dell'editor visuale.
  await click(bottoneConTesto("Visuale"));
  assert.equal(useStore.getState().editorMode, "visuale");
  assert.ok(contenitore?.querySelector(".ProseMirror"), "editor TipTap non montato");
  assert.ok(contenitore?.querySelector(".cm-editor"), "l'host CodeMirror è stato smontato");

  // Il documento della fixture è renderizzato: titoli, chip grezzi, verbatim.
  const titoli = Array.from(contenitore?.querySelectorAll("h1") ?? []);
  assert.ok(
    titoli.some((h) => (h.textContent ?? "").includes("Introduzione")),
    "il titolo della fixture non è renderizzato",
  );
  assert.ok(
    (contenitore?.querySelectorAll("code[data-raw]") ?? []).length > 0,
    "chip inline non renderizzati",
  );
  assert.ok(
    (contenitore?.querySelectorAll("pre[data-raw-blocco]") ?? []).length > 0,
    "chip di blocco non renderizzati",
  );
  assert.ok(
    (contenitore?.querySelectorAll("pre[data-verbatim]") ?? []).length > 0,
    "blocco verbatim non renderizzato",
  );
  const preambolo = contenitore?.querySelector("pre[data-preamble]");
  assert.ok(
    (preambolo?.textContent ?? "").includes("\\documentclass"),
    "il preambolo non è renderizzato come chip",
  );
  // La toolbar esiste SOLO in modalità visuale.
  assert.ok(contenitore?.querySelector('[role="toolbar"]'));

  // Click su «Sorgente»: serialize, confronto byte per byte, nessun dirty.
  await click(bottoneConTesto("Sorgente"));
  const s = useStore.getState();
  assert.equal(s.editorMode, "sorgente");
  assert.equal(s.visualDoc, null);
  assert.equal(
    s.buffers["main.tex"],
    FIXTURE,
    "il documento non è tornato byte per byte identico dopo il toggle",
  );
  assert.equal(
    s.dirty["main.tex"],
    undefined,
    "il toggle senza modifiche ha sporcato il documento",
  );
  assert.equal(contenitore?.querySelector(".ProseMirror"), null, "la vista visuale è rimonta");
  assert.equal(contenitore?.querySelector('[role="toolbar"]'), null, "la toolbar è rimasta");
});

test("parse rifiutato: resta su Sorgente, banner d'errore italiano, sorgente intatto", async () => {
  const sorgenteRotto = "\\begin{document}\n\\textbf{mai chiuso\n\\end{document}\n";
  semiStore(sorgenteRotto);
  await React.act(async () => {
    root?.render(React.createElement(EditorPane));
  });

  await click(bottoneConTesto("Visuale"));

  const s = useStore.getState();
  assert.equal(s.editorMode, "sorgente", "la modalità è cambiata nonostante il parse fallito");
  assert.equal(s.visualDoc, null);
  assert.equal(s.buffers["main.tex"], sorgenteRotto, "il sorgente è stato toccato");
  assert.ok(contenitore?.querySelector(".cm-editor"), "CodeMirror non visibile dopo l'errore");
  assert.equal(contenitore?.querySelector(".ProseMirror"), null, "nessuna vista visuale dopo l'errore");

  const avviso = contenitore?.querySelector('[role="alert"]');
  assert.ok(avviso !== null, "banner d'errore non mostrato");
  assert.ok(
    (avviso?.textContent ?? "").includes("Vista visuale non disponibile"),
    "il banner non contiene il messaggio italiano atteso",
  );

  // Chiusura del banner.
  await click(bottoneConTesto("Chiudi"));
  assert.equal(contenitore?.querySelector('[role="alert"]'), null, "il banner non si chiude");
  assert.equal(useStore.getState().visualError, null);
});

test("sorgente CRLF (file Windows reale): andata e ritorno innocua, buffer resta CRLF, nessun dirty", async () => {
  // I .tex reali su Windows hanno spesso fine riga CRLF: il toggle senza
  // modifiche NON deve riscriverli in LF (nessun dirty, nessun autosave),
  // la vista visuale funziona uguale. Vedi toggleInnocuo in store.ts.
  const crlf = FIXTURE.replace(/\n/g, "\r\n");
  semiStore(crlf);
  await React.act(async () => {
    root?.render(React.createElement(EditorPane));
  });

  await click(bottoneConTesto("Visuale"));
  assert.equal(useStore.getState().editorMode, "visuale");
  assert.ok(contenitore?.querySelector(".ProseMirror"), "editor TipTap non montato su CRLF");

  await click(bottoneConTesto("Sorgente"));
  const s = useStore.getState();
  assert.equal(s.editorMode, "sorgente");
  assert.equal(
    s.buffers["main.tex"],
    crlf,
    "il toggle innocuo ha riscritto il buffer CRLF senza un edit reale",
  );
  assert.equal(
    s.dirty["main.tex"],
    undefined,
    "il toggle innocuo su CRLF ha sporcato il documento",
  );
  assert.equal(contenitore?.querySelector(".ProseMirror"), null, "la vista visuale è rimonta");
});

/**
 * M2 — Test d'integrazione della matematica resa nel flusso reale
 * (stesso runner degli altri test: node --test).
 *
 * Render di EditorPane → click su «Visuale» → i chip matematici della fixture
 * (4 inline + 3 display) si vedono RESI con KaTeX, il sorgente verbatim sta
 * nel tooltip → click su «Sorgente» → il buffer torna IDENTICO byte per
 * byte e nessun dirty: la resa vive solo nel DOM, il round-trip non cambia.
 *
 * La matematica che KaTeX rifiuta degrada al chip grezzo di sempre: nessuna
 * eccezione, nessuna schermata bianca, la vista resta montata.
 *
 * Ambiente DOM: happy-dom (MIT, devDependency), con i globali installati
 * PRIMA degli import dinamici dei componenti. Gli .tsx passano dall'hook
 * testCaricatore.mjs (esbuild); gli import .css (katex compreso) sono
 * stubbati dallo stesso hook: nei test si guarda il DOM, non i fogli di stile.
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
// defineProperty per sostituirla con quella di happy-dom.
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
  while (finestra.document.body.firstChild) {
    finestra.document.body.removeChild(finestra.document.body.firstChild);
  }
  contenitore = null;
  finestra.close();
});

test("render → Visuale: i chip matematici resi con KaTeX, il resto grezzo → Sorgente: byte per byte, nessun dirty", async () => {
  semiStore(FIXTURE);
  await React.act(async () => {
    root?.render(React.createElement(EditorPane));
  });

  await click(bottoneConTesto("Visuale"));
  assert.equal(useStore.getState().editorMode, "visuale");
  assert.ok(contenitore?.querySelector(".ProseMirror"), "editor TipTap non montato");

  // I 7 chip matematici della fixture (4 inline + 3 display) sono resi.
  const matematici = Array.from(contenitore?.querySelectorAll("[data-matematica]") ?? []);
  assert.equal(matematici.length, 7, `attesi 7 chip matematici resi, trovati ${matematici.length}`);
  assert.equal(
    matematici.filter((m) => m.tagName === "CODE").length,
    4,
    "attesi 4 chip inline resi ($...$, \\(...\\))",
  );
  assert.equal(
    matematici.filter((m) => m.tagName === "PRE").length,
    3,
    "attesi 3 chip display resi (\\[...\\], equation, align)",
  );

  // Ogni chip reso contiene la struttura KaTeX e il sorgente VERBATIM nel
  // tooltip: la resa non ha toccato la slice.
  for (const chip of matematici) {
    assert.ok(chip.querySelector(".katex") !== null, "il chip reso non contiene la struttura KaTeX");
    const sorgente = chip.getAttribute("title") ?? "";
    assert.ok(sorgente.length > 0, "chip matematico senza sorgente nel tooltip");
    assert.ok(FIXTURE.includes(sorgente), `il tooltip non è verbatim: ${JSON.stringify(sorgente.slice(0, 30))}`);
  }

  // La matematica display è resa come blocco display.
  const displayRenders = Array.from(contenitore?.querySelectorAll("pre[data-matematica] .katex-display") ?? []);
  assert.equal(displayRenders.length, 3, "i chip display non usano il rendering display di KaTeX");

  // Il sorgente grezzo NON compare nel testo dei chip resi: si vede la
  // formula, non il LaTeX (il testo grezzo resta nei chip NON matematici).
  const inlineReso = matematici.find((m) => m.tagName === "CODE");
  assert.ok(inlineReso !== undefined);
  assert.ok(
    !(inlineReso.textContent ?? "").includes("$E = mc^2$"),
    "il chip inline matematico mostra ancora il sorgente grezzo",
  );

  // I chip NON matematici restano grezzi di sempre: tikz e footnote.
  const chipGrezzo = Array.from(contenitore?.querySelectorAll("pre[data-raw-blocco]:not([data-matematica])") ?? []);
  assert.ok(
    chipGrezzo.some((c) => (c.textContent ?? "").includes("\\draw[thick]")),
    "il chip tikzpicture non è più grezzo",
  );
  const footnote = Array.from(contenitore?.querySelectorAll("code[data-raw]:not([data-matematica])") ?? []);
  assert.ok(
    footnote.some((c) => (c.textContent ?? "").startsWith("\\footnote")),
    "il chip footnote non è più grezzo",
  );

  // Click su «Sorgente»: il buffer torna byte per byte, nessun dirty.
  await click(bottoneConTesto("Sorgente"));
  const s = useStore.getState();
  assert.equal(s.editorMode, "sorgente");
  assert.equal(
    s.buffers["main.tex"],
    FIXTURE,
    "il documento non è tornato byte per byte identico dopo la resa matematica",
  );
  assert.equal(
    s.dirty["main.tex"],
    undefined,
    "la resa matematica (sola lettura) ha sporcato il documento",
  );
});

test("matematica che KaTeX rifiuta: il chip degrada al grezzo, la vista resta viva, il round-trip è intatto", async () => {
  const sorgente = [
    "\\begin{document}",
    "formula $\\sconosciuto{x}$ e nota\\footnote{resta un chip}.",
    "",
    "\\begin{equation}",
    "\\ignoto",
    "\\end{equation}",
    "\\end{document}",
    "",
  ].join("\n");
  semiStore(sorgente);
  await React.act(async () => {
    root?.render(React.createElement(EditorPane));
  });

  await click(bottoneConTesto("Visuale"));
  assert.equal(useStore.getState().editorMode, "visuale");
  assert.ok(contenitore?.querySelector(".ProseMirror"), "la vista visuale non si è montata");

  // Nessun chip reso: KaTeX rifiuta entrambe, nessuna eccezione è esplosa.
  assert.equal(
    (contenitore?.querySelectorAll("[data-matematica]") ?? []).length,
    0,
    "un chip non renderizzabile è stato marcato come matematico",
  );

  // I chip degradati mostrano la slice verbatim, come sempre.
  const inline = Array.from(contenitore?.querySelectorAll("code[data-raw]") ?? []);
  assert.ok(
    inline.some((c) => (c.textContent ?? "").includes("\\sconosciuto{x}")),
    "la matematica inline rifiutata non degrada al chip grezzo",
  );
  const blocco = Array.from(contenitore?.querySelectorAll("pre[data-raw-blocco]") ?? []);
  assert.ok(
    blocco.some((c) => (c.textContent ?? "").includes("\\ignoto")),
    "la matematica display rifiutata non degrada al chip grezzo",
  );

  // Il footnote (non matematica) resta un chip grezzo distinto.
  assert.ok(
    inline.some((c) => (c.textContent ?? "").startsWith("\\footnote")),
    "il chip footnote è sparito",
  );

  // Click su «Sorgente»: identità byte per byte anche qui.
  await click(bottoneConTesto("Sorgente"));
  const s = useStore.getState();
  assert.equal(s.editorMode, "sorgente");
  assert.equal(s.buffers["main.tex"], sorgente, "il round-trip della matematica rifiutata non è identico");
  assert.equal(s.dirty["main.tex"], undefined, "la matematica rifiutata ha sporcato il documento");
});

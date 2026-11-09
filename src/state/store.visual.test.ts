/**
 * M1 — Test del toggle Visuale/Sorgente lato store.
 *
 * La proprietà chiave: il toggle è INNOCUO quando il serialize riproduce il
 * sorgente byte per byte (nessun dirty, nessun autosave armato); sporca il
 * documento solo quando il contenuto è davvero cambiato. Il parse rifiutato
 * lascia tutto com'era, con un messaggio d'errore italiano.
 *
 * Si esegue con `npm test` (node --test --experimental-strip-types).
 */
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROJECT_SETTINGS } from "../types.ts";
import { autosaveTimers, useStore } from "./store.ts";

// La fixture letta dal disco viene normalizzata a LF: il test deve dipendere
// dal CONTENUTO, non dal fine riga del worktree (CRLF su Windows con
// core.autocrlf). Il comportamento su sorgente CRLF vero ha i suoi test
// dedicati qui sotto.
const FIXTURE = readFileSync(new URL("../visual/fixtures/documento.tex", import.meta.url), "utf8").replace(
  /\r\n/g,
  "\n",
);

function prepara(sorgente: string, path = "main.tex") {
  useStore.setState({
    rootPath: "/tmp/progetto-fittizio",
    settings: { ...DEFAULT_PROJECT_SETTINGS, autoSave: true },
    tabs: [{ path }],
    activeTab: path,
    buffers: { [path]: sorgente },
    dirty: {},
    binaryPaths: {},
    editorMode: "sorgente",
    visualDoc: null,
    visualError: null,
  });
}

/** Copia del documento visuale con un paragrafo nuovo prima della coda. */
function docConParagrafoAggiunto(): NonNullable<typeof useStore.getState>["visualDoc"] {
  const doc = structuredClone(useStore.getState().visualDoc);
  if (!doc?.content) return doc;
  doc.content.splice(doc.content.length - 1, 0, {
    type: "paragraph",
    content: [{ type: "text", text: "Paragrafo aggiunto in visuale." }],
  });
  return doc;
}

test("toggle verso Visuale: il buffer viene interpretato, il documento è nello store", () => {
  prepara(FIXTURE);
  useStore.getState().toggleToVisual();
  const s = useStore.getState();
  assert.equal(s.editorMode, "visuale", "la modalità non è passata a visuale");
  assert.ok(s.visualDoc !== null, "il documento visuale non è stato prodotto");
  assert.equal(s.visualDoc?.content?.[0]?.type, "preamble");
  assert.equal(s.visualError, null);
});

test("andata e ritorno sulla fixture: buffer IDENTICO, nessun dirty, nessun autosave", () => {
  prepara(FIXTURE);
  useStore.getState().toggleToVisual();
  const doc = useStore.getState().visualDoc;
  assert.ok(doc !== null);
  useStore.getState().toggleToSource(doc);

  const s = useStore.getState();
  assert.equal(s.editorMode, "sorgente");
  assert.equal(s.visualDoc, null);
  assert.equal(
    s.buffers["main.tex"],
    FIXTURE,
    "il documento non è tornato byte per byte identico",
  );
  assert.equal(
    s.dirty["main.tex"],
    undefined,
    "il toggle innocuo ha marcato il documento come sporco",
  );
  assert.equal(
    autosaveTimers.has("main.tex"),
    false,
    "il toggle innocuo ha armato il timer di autosave",
  );
});

test("edits visivi: il buffer cambia, il documento si sporca, l'autosave si arma", () => {
  prepara(FIXTURE);
  useStore.getState().toggleToVisual();
  const doc = docConParagrafoAggiunto();
  assert.ok(doc !== null);
  useStore.getState().toggleToSource(doc);

  const s = useStore.getState();
  assert.ok(
    (s.buffers["main.tex"] ?? "").includes("Paragrafo aggiunto in visuale."),
    "l'edit visuale non è arrivato al buffer",
  );
  assert.equal(s.dirty["main.tex"], true, "l'edit visuale non ha sporcato il documento");
  const timer = autosaveTimers.get("main.tex");
  assert.ok(timer !== undefined, "autosave non armato dopo l'edit visuale");
  if (timer !== undefined) clearTimeout(timer);
  autosaveTimers.clear();
});

// ---- CRLF: i .tex reali su Windows hanno spesso fine riga CRLF. Il toggle
// senza modifiche deve restare innocuo anche lì (nessuna riscrittura che
// cambierebbe il file senza un edit reale), e un edit vero deve sporcare
// come sempre. Vedi toggleInnocuo in store.ts. ----

test("toggle innocuo su sorgente CRLF: buffer invariato (resta CRLF), nessun dirty, nessun autosave", () => {
  const crlf = FIXTURE.replace(/\n/g, "\r\n");
  prepara(crlf);
  useStore.getState().toggleToVisual();
  const doc = useStore.getState().visualDoc;
  assert.ok(doc !== null, "il parse di un sorgente CRLF deve riuscire");
  useStore.getState().toggleToSource(doc);

  const s = useStore.getState();
  assert.equal(s.editorMode, "sorgente");
  assert.equal(s.visualDoc, null);
  assert.equal(
    s.buffers["main.tex"],
    crlf,
    "il toggle innocuo ha riscritto il buffer CRLF (fine riga cambiate senza un edit reale)",
  );
  assert.equal(
    s.dirty["main.tex"],
    undefined,
    "il toggle innocuo su CRLF ha marcato il documento come sporco",
  );
  assert.equal(
    autosaveTimers.has("main.tex"),
    false,
    "il toggle innocuo su CRLF ha armato il timer di autosave",
  );
});

test("sorgente CRLF con edit visuale reale: il buffer cambia, dirty e autosave come sempre", () => {
  const crlf = FIXTURE.replace(/\n/g, "\r\n");
  prepara(crlf);
  useStore.getState().toggleToVisual();
  const doc = docConParagrafoAggiunto();
  assert.ok(doc !== null);
  useStore.getState().toggleToSource(doc);

  const s = useStore.getState();
  assert.ok(
    (s.buffers["main.tex"] ?? "").includes("Paragrafo aggiunto in visuale."),
    "l'edit visuale non è arrivato al buffer CRLF",
  );
  assert.equal(s.dirty["main.tex"], true, "un edit reale su CRLF non ha sporcato il documento");
  const timer = autosaveTimers.get("main.tex");
  assert.ok(timer !== undefined, "autosave non armato dopo un edit reale su CRLF");
  if (timer !== undefined) clearTimeout(timer);
  autosaveTimers.clear();
});

test("parse rifiutato (sintassi): resta su Sorgente, errore italiano, sorgente intatto", () => {
  const sorgente = "\\begin{document}\n\\textbf{mai chiuso\n\\end{document}\n";
  prepara(sorgente);
  useStore.getState().toggleToVisual();

  const s = useStore.getState();
  assert.equal(s.editorMode, "sorgente", "la modalità è cambiata nonostante il parse fallito");
  assert.equal(s.visualDoc, null);
  assert.ok(s.visualError !== null, "nessun messaggio d'errore per il parse fallito");
  assert.ok(
    s.visualError.includes("Vista visuale non disponibile"),
    "il messaggio d'errore non è quello atteso",
  );
  assert.ok(s.visualError.includes("sintassi"), "il messaggio non spiega la causa");
  assert.equal(s.buffers["main.tex"], sorgente, "il sorgente è stato toccato nonostante l'errore");

  useStore.getState().chiudiVisualError();
  assert.equal(useStore.getState().visualError, null);
});

test("\\begin{document} mai chiuso: l'errore dice cosa manca", () => {
  prepara("\\begin{document}\ntesto senza chiusura\n");
  useStore.getState().toggleToVisual();
  const s = useStore.getState();
  assert.equal(s.editorMode, "sorgente");
  assert.ok(s.visualError?.includes("\\end{document}"), "il messaggio non cita \\end{document}");
});

test("file non modificabile (binario/non UTF-8): la vista visuale non parte", () => {
  useStore.setState({
    rootPath: "/tmp/progetto-fittizio",
    settings: { ...DEFAULT_PROJECT_SETTINGS, autoSave: true },
    tabs: [{ path: "logo.png" }],
    activeTab: "logo.png",
    buffers: {},
    dirty: {},
    binaryPaths: { "logo.png": true },
    editorMode: "sorgente",
    visualDoc: null,
    visualError: null,
  });
  useStore.getState().toggleToVisual();
  const s = useStore.getState();
  assert.equal(s.editorMode, "sorgente");
  assert.equal(s.visualDoc, null);
});

test("cambio tab in visuale: leaveVisual riserializza nel buffer del tab precedente", () => {
  useStore.setState({
    rootPath: "/tmp/progetto-fittizio",
    settings: { ...DEFAULT_PROJECT_SETTINGS, autoSave: true },
    tabs: [{ path: "a.tex" }, { path: "b.tex" }],
    activeTab: "a.tex",
    buffers: { "a.tex": FIXTURE, "b.tex": "\\begin{document}\naltro\n\\end{document}\n" },
    dirty: {},
    binaryPaths: {},
    editorMode: "sorgente",
    visualDoc: null,
    visualError: null,
  });
  useStore.getState().toggleToVisual();
  const doc = docConParagrafoAggiunto();
  assert.ok(doc !== null);
  useStore.getState().leaveVisual("a.tex", doc);

  const s = useStore.getState();
  assert.equal(s.editorMode, "sorgente", "leaveVisual non è tornato in Sorgente");
  assert.ok(
    (s.buffers["a.tex"] ?? "").includes("Paragrafo aggiunto in visuale."),
    "l'edit visuale del tab precedente non è stato riportato nel suo buffer",
  );
  const timer = autosaveTimers.get("a.tex");
  assert.ok(timer !== undefined);
  if (timer !== undefined) clearTimeout(timer);
  autosaveTimers.clear();
});

test("leaveVisual su un tab già chiuso: nessuna scrittura, nessun timer", () => {
  prepara(FIXTURE);
  useStore.getState().toggleToVisual();
  const doc = docConParagrafoAggiunto();
  assert.ok(doc !== null);
  // il tab non esiste più: le modifiche non scritte restano dove sono,
  // come alla chiusura di un tab dentro la finestra di autosave.
  useStore.setState({ tabs: [], activeTab: null });
  useStore.getState().leaveVisual("main.tex", doc);

  const s = useStore.getState();
  assert.equal(s.buffers["main.tex"], FIXTURE, "scrittura nel buffer di un tab chiuso");
  assert.equal(autosaveTimers.has("main.tex"), false, "timer armato per un tab chiuso");
  autosaveTimers.clear();
});

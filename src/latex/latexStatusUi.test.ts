/**
 * Test discriminanti M0.7.1 — la rilevazione strumenti LaTeX visibile e
 * azionabile (si esegue con `npm test`, cioè `node --test`).
 *
 * Il click-test del maintainer (macchina SENZA distribuzione LaTeX) ha
 * mostrato il difetto: click su «Compila (F5)» → l'errore grezzo
 * «impossibile avviare pdflatex: program not found» finiva dritto nel log,
 * e nell'interfaccia non esisteva alcun punto in cui VEDERE l'esito della
 * rilevazione strumenti (detect_latex esiste ma la sua risposta non
 * arrivava all'utente).
 *
 * Contratto verificato qui (pura logica, senza DOM):
 * - latexChipLabel: dato un LatexStatus produce il testo del chip della
 *   barra di stato — «LaTeX: pronto (latexmk)» / «LaTeX: assente» / …;
 * - latexToolRows: l'elenco ordinato dei sei tool con disponibilità;
 * - latexGuidance: il testo guida quando la distribuzione manca;
 * - describeBuildStartError: l'errore TIPIZZATO del gate backend
 *   (Nessuna distribuzione LaTeX trovata / non include il motore) apre un
 *   DIALOG di guida, NON la stringa grezza nel log.
 *
 * Punti di fallimento sulla versione naive: il modulo non esiste — né il
 * chip, né il mapper, né il dialog.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { LatexStatus, ToolInfo } from "../types.ts";
import {
  latexChipLabel,
  latexToolRows,
  latexGuidance,
  describeBuildStartError,
} from "./latexStatusUi.ts";

const NO_DISTRIBUTION_MESSAGE =
  "Nessuna distribuzione LaTeX trovata: per compilare serve MiKTeX o TeX Live " +
  "(vedi la sezione Requisiti del manuale). Dopo l'installazione riavvia l'app.";

const ENGINE_MISSING_MESSAGE =
  "La distribuzione LaTeX installata non include il motore xelatex: scegline un " +
  "altro disponibile (l'elenco degli strumenti è nella barra di stato, alla voce " +
  "«LaTeX») oppure installa il pacchetto corrispondente (vedi la sezione Requisiti " +
  "del manuale).";

function tool(name: string, available: boolean, version = ""): ToolInfo {
  return { name, available, version };
}

function status(...tools: ToolInfo[]): LatexStatus {
  const all = [
    tool("pdflatex", false),
    tool("xelatex", false),
    tool("lualatex", false),
    tool("latexmk", false),
    tool("bibtex", false),
    tool("biber", false),
    ...tools,
  ];
  const byName = new Map(all.map((t) => [t.name, t]));
  const ordered = [
    "pdflatex",
    "xelatex",
    "lualatex",
    "latexmk",
    "bibtex",
    "biber",
  ].map((n) => byName.get(n) ?? tool(n, false));
  return {
    tools: ordered,
    latexmkAvailable: ordered.find((t) => t.name === "latexmk")?.available ?? false,
  };
}

// ---- chip della barra di stato: il testo dato un LatexStatus ----

test("chip: con latexmk → «LaTeX: pronto (latexmk)», tono ok", () => {
  const label = latexChipLabel(status(tool("latexmk", true, "latexmk 4.83b"), tool("pdflatex", true)));
  assert.deepEqual(label, { text: "LaTeX: pronto (latexmk)", tone: "ok" });
});

test("chip: motori senza latexmk → «LaTeX: pronto (<motore>)», tono warn", () => {
  const label = latexChipLabel(status(tool("pdflatex", true, "pdflatex 3.14")));
  assert.deepEqual(label, { text: "LaTeX: pronto (pdflatex)", tone: "warn" });
  const label2 = latexChipLabel(status(tool("xelatex", true)));
  assert.deepEqual(label2, { text: "LaTeX: pronto (xelatex)", tone: "warn" });
});

test("chip: nessuna distribuzione → «LaTeX: assente», tono bad", () => {
  const label = latexChipLabel(status());
  assert.deepEqual(label, { text: "LaTeX: assente", tone: "bad" });
});

test("chip: rilevazione non ancora riuscita → testo esplicito, tono idle", () => {
  const label = latexChipLabel(null);
  assert.equal(label.text, "LaTeX: rilevazione in corso…");
  assert.equal(label.tone, "idle");
});

// ---- dettaglio: elenco strumenti ordinato e guida ----

test("dettaglio: sei tool in ordine fisso, con disponibilità e versione", () => {
  const rows = latexToolRows(
    status(tool("pdflatex", true, "pdflatex 3.14"), tool("latexmk", true, "latexmk 4.83b")),
  );
  assert.deepEqual(
    rows.map((r) => r.name),
    ["pdflatex", "xelatex", "lualatex", "latexmk", "bibtex", "biber"],
  );
  assert.equal(rows.find((r) => r.name === "pdflatex")?.available, true);
  assert.equal(rows.find((r) => r.name === "pdflatex")?.version, "pdflatex 3.14");
  assert.equal(rows.find((r) => r.name === "biber")?.available, false);
  // Un LatexStatus parziale (tool mancanti dalla risposta) resta ordinato e
  // completo: le righe assenti contano come NON disponibili.
  const partial = latexToolRows({ tools: [tool("latexmk", true)], latexmkAvailable: true });
  assert.deepEqual(
    partial.map((r) => r.name),
    ["pdflatex", "xelatex", "lualatex", "latexmk", "bibtex", "biber"],
  );
  assert.equal(partial.find((r) => r.name === "latexmk")?.available, true);
  assert.equal(partial.find((r) => r.name === "pdflatex")?.available, false);
});

test("guida: presente SOLO quando non c'è nulla con cui compilare", () => {
  assert.equal(latexGuidance(status(tool("pdflatex", true))), null);
  assert.equal(latexGuidance(status(tool("latexmk", true))), null);
  const g = latexGuidance(status());
  assert.ok(g, "manca il testo guida con distribuzione assente");
  assert.ok(g.includes("MiKTeX"), "la guida non indica MiKTeX");
  assert.ok(g.includes("TeX Live"), "la guida non indica TeX Live");
  assert.ok(g.includes("riavvia"), "la guida non dice di riavviare l'app");
  // il contrario dell'invariante offline: nessun invito a scaricare DALL'APP
  assert.ok(!/scarica|download dall'app/i.test(g), "la guida non può invitare a scaricare dall'app");
});

// ---- mapper: l'errore tipizzato del gate backend → dialog di guida ----

test("mapper: «Nessuna distribuzione LaTeX trovata…» → dialog di guida, NON log grezzo", () => {
  const d = describeBuildStartError(NO_DISTRIBUTION_MESSAGE);
  assert.equal(d.kind, "toolchain");
  assert.equal(d.title, "Impossibile compilare");
  assert.equal(d.body, NO_DISTRIBUTION_MESSAGE);
});

test("mapper: «non include il motore X» → dialog di guida", () => {
  const d = describeBuildStartError(ENGINE_MISSING_MESSAGE);
  assert.equal(d.kind, "toolchain");
  assert.equal(d.title, "Impossibile compilare");
  assert.equal(d.body, ENGINE_MISSING_MESSAGE);
});

test("mapper: errore generico → riga di log (comportamento precedente), nessun dialog", () => {
  const d = describeBuildStartError(new Error("una compilazione è già in corso"));
  assert.equal(d.kind, "generic");
  assert.ok(d.text.includes("una compilazione è già in corso"));
  assert.ok(d.text.startsWith("avvio compilazione fallito"));
});

test("mapper: l'errore io grezzo dello spawn cieco NON è un dialog di toolchain", () => {
  // È la stringa che il click-test del maintainer vedeva nel log: deve
  // restare una riga di log, non aprire il dialog (non è l'esito tipizzato).
  const d = describeBuildStartError("impossibile avviare pdflatex: program not found");
  assert.equal(d.kind, "generic");
});

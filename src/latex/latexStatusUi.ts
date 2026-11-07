/**
 * Logica UI della rilevazione strumenti LaTeX — M0.7.1.
 *
 * Funzioni PURE (nessun React, nessun Tauri): il chip della barra di stato,
 * il dettaglio degli strumenti e il mapping dell'errore tipizzato del gate
 * backend sono tutti derivabili e testati qui. I componenti
 * (LatexChip, BuildStartDialog) non fanno aritmetica: solo impaginazione.
 *
 * Il contratto dei messaggi del gate è deciso lato backend
 * (src-tauri/src/toolchain.rs, ToolchainProblem::user_message) e qui viene
 * RICONOSCIUTO per aprire il dialog di guida invece di incollare la
 * stringa nel log: i prefissi sono stabili e inchiodati dai test di
 * entrambi i lati.
 */
import type { LatexStatus } from "../types.ts";

export type LatexChipTone = "ok" | "warn" | "bad" | "idle";

export interface LatexChipLabel {
  text: string;
  tone: LatexChipTone;
}

/** I sei tool che il dettaglio del chip elenca, in ordine fisso. */
const TOOL_ORDER = ["pdflatex", "xelatex", "lualatex", "latexmk", "bibtex", "biber"] as const;

/** I motori con cui si può compilare, nell'ordine di preferenza del chip. */
const ENGINE_ORDER = ["pdflatex", "xelatex", "lualatex"] as const;

/** Prefissi stabili dei messaggi tipizzati del gate backend. */
const NO_DISTRIBUTION_PREFIX = "Nessuna distribuzione LaTeX trovata";
const ENGINE_MISSING_PREFIX = "La distribuzione LaTeX installata non include il motore";

/**
 * Testo e tono del chip della barra di stato dato un LatexStatus:
 * «LaTeX: pronto (latexmk)» / «LaTeX: pronto (<motore>)» / «LaTeX: assente»
 * / «LaTeX: rilevazione in corso…» quando la risposta non c'è (ancora).
 */
export function latexChipLabel(latex: LatexStatus | null): LatexChipLabel {
  if (!latex) {
    return { text: "LaTeX: rilevazione in corso…", tone: "idle" };
  }
  if (latex.latexmkAvailable) {
    return { text: "LaTeX: pronto (latexmk)", tone: "ok" };
  }
  const firstEngine = ENGINE_ORDER.find((name) =>
    (latex.tools ?? []).some((t) => t.name === name && t.available),
  );
  if (firstEngine) {
    return { text: `LaTeX: pronto (${firstEngine})`, tone: "warn" };
  }
  return { text: "LaTeX: assente", tone: "bad" };
}

export interface LatexToolRow {
  name: string;
  available: boolean;
  version: string;
}

/**
 * Le sei righe del dettaglio (pdflatex/xelatex/lualatex/latexmk/bibtex/biber)
 * in ordine fisso: un LatexStatus parziale resta completo, con le righe
 * assenti contate come NON disponibili.
 */
export function latexToolRows(latex: LatexStatus | null): LatexToolRow[] {
  const tools = latex?.tools ?? [];
  return TOOL_ORDER.map((name) => {
    const t = tools.find((x) => x.name === name);
    return { name, available: t?.available ?? false, version: t?.version ?? "" };
  });
}

/**
 * Testo guida quando non c'è nulla con cui compilare; null quando la
 * distribuzione c'è. Guida SOLO testuale: l'app resta offline, nessun
 * invito a scaricare dall'app.
 */
export function latexGuidance(latex: LatexStatus | null): string | null {
  const chip = latexChipLabel(latex);
  if (chip.tone !== "bad") return null;
  return (
    "Per compilare serve una distribuzione LaTeX installata sul computer " +
    "(MiKTeX su Windows, TeX Live su Linux e macOS): l'editor non la include e " +
    "resta completamente offline. Dopo l'installazione riavvia l'app, poi premi " +
    "«Rileggi» qui sopra — vedi la sezione Requisiti del manuale."
  );
}

export type BuildStartError =
  | { kind: "toolchain"; title: string; body: string }
  | { kind: "generic"; text: string };

/**
 * Classifica l'errore con cui start_build è stato rifiutato:
 * - messaggio TIPIZZATO del gate (distribuzione assente / motore mancante)
 *   → dialog di guida «Impossibile compilare» col testo azionabile;
 * - qualunque altro errore → riga di log, come ha sempre fatto l'app.
 */
export function describeBuildStartError(e: unknown): BuildStartError {
  const raw = e instanceof Error ? e.message : String(e);
  if (
    raw.startsWith(NO_DISTRIBUTION_PREFIX) ||
    raw.startsWith(ENGINE_MISSING_PREFIX)
  ) {
    return { kind: "toolchain", title: "Impossibile compilare", body: raw };
  }
  return { kind: "generic", text: `avvio compilazione fallito: ${raw}` };
}

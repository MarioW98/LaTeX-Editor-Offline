/**
 * Test discriminante F1 — lato store (si esegue con `npm test`, cioè
 * `node --test`).
 *
 * Un buffer marcato non modificabile (binaryPaths) NON deve mai finire nel
 * buffer di editing e NON deve mai schedulare il timer di autosave a 1200 ms:
 * altrimenti l'autosave riscriverebbe il file su disco rovinandolo.
 *
 * Sul codice precedente alla correzione questo test FALLIVA in due punti:
 * updateBuffer salvava il contenuto nello store e armava il timer di
 * autosave anche per i path marcati binari.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROJECT_SETTINGS } from "../types.ts";
import { autosaveTimers, useStore } from "./store.ts";

test("updateBuffer su file non modificabile: nessun buffer, nessun timer di autosave", () => {
  useStore.setState({
    rootPath: "/tmp/progetto-fittizio",
    settings: { ...DEFAULT_PROJECT_SETTINGS, autoSave: true },
    binaryPaths: { "foto.png": true },
    buffers: {},
    dirty: {},
  });

  useStore.getState().updateBuffer("foto.png", "contenuto che non deve mai tornare su disco");

  assert.equal(
    useStore.getState().buffers["foto.png"],
    undefined,
    "il buffer di un file non modificabile è stato aggiornato",
  );
  assert.equal(
    useStore.getState().dirty["foto.png"],
    undefined,
    "un file non modificabile è stato marcato come modificato",
  );
  assert.equal(
    autosaveTimers.has("foto.png"),
    false,
    "timer di autosave schedulato per un file non modificabile",
  );

  // Controllo simmetrico: un file modificabile normale continua a ricevere
  // buffer + timer (dimostra che la guardia è davvero il discriminante).
  useStore.getState().updateBuffer("main.tex", "\\documentclass{article}");
  assert.equal(
    useStore.getState().buffers["main.tex"],
    "\\documentclass{article}",
    "il buffer di un file modificabile non è stato aggiornato",
  );
  const timer = autosaveTimers.get("main.tex");
  assert.ok(timer !== undefined, "autosave non schedulato per un file modificabile");
  if (timer !== undefined) clearTimeout(timer);
  autosaveTimers.clear();
});

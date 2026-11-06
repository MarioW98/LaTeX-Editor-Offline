/**
 * Test discriminante F1 — lato editor (si esegue con `npm test`).
 *
 * Lo stato documento di un file non modificabile deve essere creato con
 * `EditorState.readOnly.of(true)`: la factory `createEditorState` riceve
 * `editable === false` e lo stato risultante deve esporre il facet readOnly
 * (è il facet che il livello di view/comandi di CodeMirror usa per bloccare
 * la battitura). La protezione "nessun contenuto torna su disco" è invece
 * garantita dalla guardia in store.updateBuffer
 * (vedi src/state/store.autosave.test.ts).
 *
 * Sul codice precedente alla correzione la factory non esisteva e gli stati
 * venivano creati inline in EditorPane senza alcun facet readOnly: eseguendo
 * questo test contro quella logica (variante "naive" che ignora `editable`)
 * l'asserzione sul facet falliva.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { createEditorState } from "./docState.ts";

test("stato documento di file non modificabile: creato con EditorState.readOnly.of(true)", () => {
  const ro = createEditorState("città àèù — testo di prova", "foto.png", 14, false);
  assert.equal(
    ro.facet(EditorState.readOnly),
    true,
    "il facet readOnly non è impostato sullo stato non modificabile",
  );

  // Controllo simmetrico: un file modificabile NON ha il facet readOnly.
  const ed = createEditorState("città àèù — testo di prova", "main.tex", 14, true);
  assert.equal(ed.facet(EditorState.readOnly), false);
});

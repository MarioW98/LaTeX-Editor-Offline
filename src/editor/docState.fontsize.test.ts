/**
 * Test discriminante B0.6 — cambio fontSize senza perdere la cronologia
 * undo (si esegue con `npm test`, cioè `node --test`).
 *
 * Il tema (dimensione carattere) vive in un Compartment: al cambio di
 * fontSize EditorPane ridispaccia l'effect di reconfigure del Compartment
 * SENZA ricreare l'EditorState — la cronologia undo/redo, la piegatura del
 * codice e la selezione dell'utente sopravvivono. Qui si verifica su uno
 * stato CodeMirror reale (senza DOM) la parte di stato: documento e
 * history invariati attraverso il cambio, e facet readOnly preservato per
 * i file non modificabili.
 *
 * Sul codice precedente alla correzione (EditorPane ricreava lo stato da
 * zero con createEditorState(...)) questo test FALLIVA nel punto
 * `la cronologia undo è stata azzerata dal cambio di fontSize`
 * (undoDepth 0) e nel controllo simmetrico sul documento: la ricreazione
 * azzera la history della sessione di editing.
 *
 * Il rendering visivo del cambio di dimensione è del click-test del
 * maintainer.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { undoDepth } from "@codemirror/commands";
import { createEditorState, fontSizeEffect } from "./docState.ts";

test("cambio fontSize via Compartment: history e documento invariati", () => {
  let st = createEditorState("prima riga\n", "main.tex", 14, true);
  // Sessione di editing reale: due modifiche -> cronologia non vuota.
  st = st.update({ changes: { from: st.doc.length, insert: "seconda riga\n" } }).state;
  st = st.update({ changes: { from: st.doc.length, insert: "terza riga\n" } }).state;
  assert.ok(
    undoDepth(st) > 0,
    "la cronologia undo doveva essere non vuota PRIMA del cambio di fontSize",
  );
  const docBefore = st.doc.toString();

  // Il cambio di fontSize come lo applica EditorPane: effect di
  // reconfigure del Compartment, NON ricreazione dello stato.
  const st2 = st.update({ effects: fontSizeEffect(18) }).state;

  assert.equal(
    st2.doc.toString(),
    docBefore,
    "il documento è cambiato al cambio di fontSize",
  );
  assert.ok(
    undoDepth(st2) > 0,
    "la cronologia undo è stata azzerata dal cambio di fontSize",
  );
  // Un documento modificabile resta modificabile: l'estensione read-only
  // (e tutte le altre) non viene toccata dal reconfigure.
  assert.equal(st2.facet(EditorState.readOnly), false);

  // Controllo simmetrico su un file NON modificabile: il facet readOnly
  // sopravvive al cambio di fontSize esattamente come prima.
  const ro = createEditorState("contenuto protetto", "foto.png", 14, false);
  const ro2 = ro.update({ effects: fontSizeEffect(18) }).state;
  assert.equal(
    ro2.facet(EditorState.readOnly),
    true,
    "il facet readOnly di un file non modificabile è stato perso nel cambio di fontSize",
  );
  assert.equal(ro2.doc.toString(), "contenuto protetto");
});

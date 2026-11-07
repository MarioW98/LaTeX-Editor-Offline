/**
 * Test discriminanti M0.7.2 — messaggi dell'updater azionabili in italiano
 * (si esegue con `npm test`, cioè `node --test`).
 *
 * Fatto del click-test: «Controlla aggiornamenti» senza tag v* pubblicati
 * mostra l'errore grezzo in inglese del plugin
 * («Could not fetch a valid release JSON…») direttamente nella strip.
 *
 * Contratto: NESSUNA stringa grezza del plugin arriva all'utente.
 * mapUpdaterError produce:
 * - il caso specifico del canale non raggiungibile (rete assente o ancora
 *   nessun rilascio pubblicato) con il messaggio italiano deciso;
 * - un fallback generico col titolo della fase fallita e il dettaglio
 *   tecnico come riga secondaria.
 *
 * Punto di fallimento sulla versione naive: mapUpdaterError non esiste e
 * lo store incollla describeError(e) direttamente nel messaggio.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapUpdaterError } from "./updaterService.ts";

const CHANNEL_MESSAGE =
  "Impossibile contattare il canale degli aggiornamenti: verifica la connessione " +
  "o riprova dopo il primo rilascio.";

test("«Could not fetch a valid release JSON…» → messaggio italiano del canale, senza dettaglio grezzo", () => {
  const m = mapUpdaterError(
    new Error(
      "Could not fetch a valid release JSON from the remote. Tried 2 endpoints.",
    ),
    "check",
  );
  assert.equal(m.title, CHANNEL_MESSAGE);
  assert.equal(m.detail, null, "il caso specifico non mostra il dettaglio inglese");
});

test("errore sconosciuto → fallback col titolo della fase e dettaglio tecnico come riga secondaria", () => {
  const m = mapUpdaterError(new Error("rete non raggiungibile"), "check");
  assert.equal(m.title, "Controllo aggiornamenti non riuscito");
  assert.equal(m.detail, "rete non raggiungibile");

  const d = mapUpdaterError(new Error("connessione caduta"), "download");
  assert.equal(d.title, "Scaricamento dell'aggiornamento non riuscito");
  assert.equal(d.detail, "connessione caduta");

  const i = mapUpdaterError(new Error("firma non valida"), "install");
  assert.equal(i.title, "Installazione dell'aggiornamento non riuscita");
  assert.equal(i.detail, "firma non valida");
});

test("il riconoscimento del canale non dipende dal case del plugin", () => {
  const m = mapUpdaterError(
    new Error("could not fetch a valid release json: endpoint unreachable"),
    "check",
  );
  assert.equal(m.title, CHANNEL_MESSAGE);
});

/**
 * Test discriminante B0.2 — timer di autosave alla chiusura/ridenominazione
 * (si esegue con `npm test`, cioè `node --test`).
 *
 * closeTab NON deve lasciare in vita il timer autosave del path: se il file
 * viene chiuso (o rinominato) entro 1,2 s dall'ultima modifica, il timer in
 * differita riscriverebbe comunque il buffer su disco — nel caso del rename
 * col VECCHIO nome, ricreando il file appena rinominato.
 *
 * Sul codice precedente alla correzione questo test FALLIVA nel punto
 * `autosaveTimers ha ancora il path dopo closeTab`: il timer sopravviveva
 * alla chiusura della tab e, scaduto il debounce, tentava la scrittura
 * (osservabile come riga di log "salvataggio fallito" perché in ambiente
 * di test invoke non esiste).
 *
 * L'integrazione del rename con il filesystem (rinominare sul disco e
 * riaprire il file col nuovo nome) è coperta dal click-test del maintainer:
 * qui si verifica la sola logica del timer nel store.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROJECT_SETTINGS } from "../types.ts";
import { autosaveTimers, useStore } from "./store.ts";

test("closeTab cancella il timer autosave pendente: nessuna scrittura dopo il debounce", async () => {
  useStore.setState({
    rootPath: "/tmp/progetto-fittizio",
    settings: { ...DEFAULT_PROJECT_SETTINGS, autoSave: true },
    binaryPaths: {},
    buffers: {},
    dirty: {},
    tabs: [{ path: "main.tex" }],
    activeTab: "main.tex",
    buildLog: [],
  });

  // Armo il timer come farebbe una modifica reale su un file modificabile.
  useStore.getState().updateBuffer("main.tex", "\\documentclass{article}");
  assert.ok(
    autosaveTimers.has("main.tex"),
    "il timer di autosave doveva essere armato dalla modifica",
  );

  useStore.getState().closeTab("main.tex");

  assert.equal(
    autosaveTimers.has("main.tex"),
    false,
    "il timer di autosave è sopravvissuto alla chiusura della tab",
  );

  // Dopo il tempo di debounce (1200 ms) + margine non deve esserci stata
  // NESSUNA scrittura: un tentativo fallito produrrebbe una riga di log
  // "salvataggio fallito" nel buildLog dello store.
  await new Promise((r) => setTimeout(r, 1600));
  assert.equal(
    useStore.getState().buildLog.length,
    0,
    "è stata tentata una scrittura su disco dopo la chiusura della tab",
  );
  assert.equal(
    useStore.getState().tabs.find((t) => t.path === "main.tex"),
    undefined,
    "la tab doveva essere chiusa",
  );

  // Pulizia finale dello store per non influenzare altri test.
  useStore.setState({ tabs: [], activeTab: null, buildLog: [] });
});

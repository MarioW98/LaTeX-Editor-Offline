/**
 * Test discriminante B0.3 — cambio progetto durante una build
 * (si esegue con `npm test`, cioè `node --test`).
 *
 * setRoot non cancellava una build in corso e non resettava
 * buildRunning/buildLog/lastBuildSuccess: passando a un altro progetto (o a
 * nessun progetto) il nuovo non si poteva compilare finché la vecchia build
 * non finiva, e i log dei due progetti si mescolavano. Inoltre i timer
 * autosave pendenti restavano armati con path relativi che puntavano al
 * progetto sbagliato.
 *
 * Sul codice precedente alla correzione questo test FALLIVA al punto
 * `buildRunning resta true dopo setRoot`: il ramo null di setRoot non
 * toccava affatto buildRunning, e né il ramo null né quello con progetto
 * svuotavano la mappa dei timer autosave.
 *
 * Il vero cancel dell'IPC (cancel_build che ferma il processo LaTeX) è
 * coperto dal click-test del maintainer: qui si verifica la logica dello
 * store (cancel_build viene invocato, lo stato viene resettato, i timer
 * vengono svuotati).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROJECT_SETTINGS } from "../types.ts";
import { autosaveTimers, useStore } from "./store.ts";

test("setRoot a null: build in corso cancellata, timer svuotati, log azzerati", async () => {
  useStore.setState({
    rootPath: "/tmp/progetto-vecchio",
    settings: { ...DEFAULT_PROJECT_SETTINGS, autoSave: true },
    binaryPaths: {},
    buffers: {},
    dirty: {},
    tabs: [{ path: "main.tex" }],
    activeTab: "main.tex",
    buildRunning: true,
    buildLog: [
      {
        tsMs: 1,
        kind: "error",
        file: null,
        line: null,
        text: "log della build del vecchio progetto",
      },
    ],
    lastBuildSuccess: true,
  });

  // Timer autosave pendente su un path RELATIVO del vecchio progetto.
  useStore.getState().updateBuffer("main.tex", "\\documentclass{article}");
  assert.ok(
    autosaveTimers.has("main.tex"),
    "il timer di autosave doveva essere armato dalla modifica",
  );

  await useStore.getState().setRoot(null);

  assert.equal(
    useStore.getState().buildRunning,
    false,
    "buildRunning è rimasto true dopo il cambio progetto: il nuovo progetto non sarebbe compilabile",
  );
  assert.equal(
    useStore.getState().buildLog.length,
    0,
    "il log della build del vecchio progetto è sopravvissuto al cambio progetto",
  );
  assert.equal(
    useStore.getState().lastBuildSuccess,
    null,
    "lastBuildSuccess del vecchio progetto è sopravvissuto al cambio progetto",
  );
  assert.equal(
    autosaveTimers.size,
    0,
    "timer autosave pendenti con path relativi al vecchio progetto sopravvissuti al cambio progetto",
  );
  assert.equal(useStore.getState().rootPath, null);

  // Pulizia finale dello store per non influenzare altri test.
  useStore.setState({ tabs: [], activeTab: null, buildRunning: false, buildLog: [] });
});

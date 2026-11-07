/**
 * Test discriminanti MU.3 — aggiornamenti opt-in (si esegue con `npm test`,
 * cioè `node --test`).
 *
 * L'adapter finto si inietta con la stessa tecnica degli store test:
 * useStore.setState({ updaterPort: … }). L'invariante da dimostrare:
 * NESSUN accesso automatico alla rete — l'unico ingresso è il click
 * dell'utente su «Controlla aggiornamenti».
 *
 * Punti di fallimento sulla versione naive:
 *   (a) un check automatico nel bootstrap chiamerebbe l'adapter: il test
 *       «bootstrap non chiama mai l'adapter» fallisce su calls.check !== 0;
 *   (b) senza macchina a stati non ci sarebbero available → downloading con
 *       progresso → ready: gli assert sulle fasi falliscono;
 *   (c) un errore di rete non gestito (reject non catturato) crasherebbe il
 *       test invece di produrre lo stato error col messaggio;
 *   (d) senza salvataggio dei buffer sporchi prima di install: l'ordine
 *       eventi sarebbe ["install", …] senza i "save:" (d1), e con il
 *       salvataggio fallito l'install partirebbe comunque (d2).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROJECT_SETTINGS } from "../types.ts";
import { useStore, type UpdateUiState } from "./store.ts";
import type { CheckedUpdate, UpdaterPort } from "../updater/updaterService.ts";

interface Porta {
  check?: () => Promise<CheckedUpdate | null>;
  relaunch?: () => Promise<void>;
}

/** Adapter finto che registra ogni chiamata in `calls`. */
function fakePort(calls: string[], overrides: Porta = {}): UpdaterPort {
  return {
    check:
      overrides.check ??
      (async () => {
        calls.push("check");
        return null;
      }),
    relaunch:
      overrides.relaunch ??
      (async () => {
        calls.push("relaunch");
      }),
  };
}

function fakeUpdate(partial: Partial<CheckedUpdate> = {}): CheckedUpdate {
  return {
    version: "0.2.1",
    currentVersion: "0.2.0",
    notes: "note di rilascio di test",
    download: async () => {},
    install: async () => {},
    ...partial,
  };
}

// Il saveFile vero, catturato prima che qualunque test lo sovrascriva:
// resetUpdateState() lo reinstalla sempre, così un fake del test (d1) non
// può influenzare il test (d2) che si affida al salvataggio REALE (che in
// ambiente di test fallisce perché invoke non esiste).
const originalSaveFile = useStore.getState().saveFile;

function resetUpdateState() {
  useStore.setState({
    update: { phase: "idle" },
    rootPath: "/tmp/progetto-fittizio",
    settings: { ...DEFAULT_PROJECT_SETTINGS, autoSave: true },
    binaryPaths: {},
    buffers: {},
    dirty: {},
    tabs: [],
    activeTab: null,
    buildLog: [],
    saveFile: originalSaveFile,
  });
}

// (a) — il bootstrap dell'app NON deve MAI chiamare l'adapter.
test("bootstrap: nessun check automatico, l'adapter non viene mai chiamato", async () => {
  const calls: string[] = [];
  resetUpdateState();
  useStore.setState({ updaterPort: fakePort(calls) });

  // Questo è il vero bootstrap dell'app (App.tsx lo avvia al mount):
  // deve toccare LaTeX, impostazioni e progetto, MAI la rete degli update.
  await useStore.getState().bootstrap();

  assert.deepEqual(
    calls,
    [],
    `il bootstrap ha toccato l'updater: ${calls.join(", ")}`,
  );
  assert.equal(
    useStore.getState().update.phase,
    "idle",
    "il bootstrap ha cambiato lo stato aggiornamenti",
  );
});

// (b) — macchina a stati: disponibile → scaricamento con progresso → ready.
test("check → available{versione, note} → downloading{progress} → ready", async () => {
  const calls: string[] = [];
  const seenDuringDownload: UpdateUiState[] = [];
  resetUpdateState();
  useStore.setState({
    updaterPort: fakePort(calls, {
      check: async () => {
        calls.push("check");
        return fakeUpdate({
          download: async (onProgress) => {
            onProgress({ received: 30, total: 100 });
            seenDuringDownload.push({ ...useStore.getState().update });
            await new Promise((r) => setTimeout(r, 10));
            onProgress({ received: 100, total: 100 });
            seenDuringDownload.push({ ...useStore.getState().update });
          },
        });
      },
    }),
  });

  // Guardia: chiamare download/install PRIMA del check non fa nulla.
  await useStore.getState().downloadUpdate();
  await useStore.getState().installUpdate();
  assert.equal(useStore.getState().update.phase, "idle");

  await useStore.getState().checkForUpdates();
  const available = useStore.getState().update;
  assert.equal(available.phase, "available");
  assert.equal(available.phase === "available" && available.version, "0.2.1");
  assert.equal(
    available.phase === "available" && available.notes,
    "note di rilascio di test",
  );

  await useStore.getState().downloadUpdate();
  // Durante lo scaricamento lo stato è downloading col progresso assoluto.
  const [faseTre, faseCento] = seenDuringDownload;
  assert.equal(faseTre?.phase, "downloading");
  assert.ok(
    faseTre?.phase === "downloading" && faseTre.received === 30 && faseTre.total === 100,
    `progresso atteso {received: 30, total: 100}, visto: ${JSON.stringify(faseTre)}`,
  );
  assert.ok(
    faseCento?.phase === "downloading" && faseCento.received === 100,
    `progresso atteso {received: 100}, visto: ${JSON.stringify(faseCento)}`,
  );
  assert.equal(useStore.getState().update.phase, "ready");
});

// (b-bis) — check senza aggiornamenti: up-to-date, mai errori muti.
test("check senza aggiornamenti disponibili → up-to-date", async () => {
  const calls: string[] = [];
  resetUpdateState();
  useStore.setState({
    updaterPort: fakePort(calls, {
      check: async () => {
        calls.push("check");
        return null;
      },
    }),
  });
  await useStore.getState().checkForUpdates();
  assert.equal(useStore.getState().update.phase, "up-to-date");
});

// (c) — errore di rete: stato error con messaggio esplicito, mai crash.
// M0.7.2: il messaggio è il titolo italiano della fase fallita; il dettaglio
// tecnico del plugin resta come riga SECONDARIA (update.detail).
test("errore di rete in check e in download → stato error col messaggio, store vivo", async () => {
  const calls: string[] = [];
  resetUpdateState();
  useStore.setState({
    updaterPort: fakePort(calls, {
      check: async () => {
        calls.push("check-fallito");
        throw new Error("rete non raggiungibile");
      },
    }),
  });

  await useStore.getState().checkForUpdates();
  const st = useStore.getState().update;
  assert.equal(st.phase, "error");
  assert.ok(
    st.phase === "error" && st.message.includes("Controllo aggiornamenti non riuscito"),
    "il messaggio non spiega quale fase è fallita",
  );
  assert.ok(
    st.phase === "error" && (st.detail ?? "").includes("rete non raggiungibile"),
    `il dettaglio tecnico è andato perso: ${JSON.stringify(st)}`,
  );
  // La prima riga resta il messaggio italiano, NON la stringa grezza.
  assert.ok(
    st.phase === "error" && !st.message.includes("rete non raggiungibile"),
    "la stringa grezza del plugin è finita in prima riga",
  );

  // Lo store resta perfettamente utilizzabile: si può riprovare subito.
  useStore.setState({
    updaterPort: fakePort(calls, {
      check: async () => {
        calls.push("check-dopo-errore");
        return fakeUpdate({
          download: async () => {
            throw new Error("connessione caduta durante lo scaricamento");
          },
        });
      },
    }),
  });
  await useStore.getState().checkForUpdates();
  assert.equal(useStore.getState().update.phase, "available");
  await useStore.getState().downloadUpdate();
  const st2 = useStore.getState().update;
  assert.equal(st2.phase, "error");
  assert.ok(
    st2.phase === "error" &&
      st2.message.includes("Scaricamento dell'aggiornamento non riuscito"),
    `il messaggio non spiega quale fase è fallita: ${JSON.stringify(st2)}`,
  );
  assert.ok(
    st2.phase === "error" && (st2.detail ?? "").includes("connessione caduta"),
    `il dettaglio tecnico del download fallito è andato perso: ${JSON.stringify(st2)}`,
  );
});

// (d1) — prima di installare, TUTTI i buffer sporchi vengono salvati.
test("installazione: i file sporchi vengono salvati PRIMA dell'installazione", async () => {
  const events: string[] = [];
  let dirtyAllInstall: Record<string, boolean> = {};
  resetUpdateState();
  useStore.setState({
    buffers: { "main.tex": "\\documentclass{article}", "note.tex": "bozza" },
    dirty: { "main.tex": true, "note.tex": true },
    tabs: [{ path: "main.tex" }],
    activeTab: "main.tex",
    // saveFile finto (stessa tecnica degli store test): registra l'ordine e
    // simula il salvataggio riuscito spegnendo il dirty flag.
    saveFile: async (path) => {
      events.push(`save:${path}`);
      useStore.setState((s) => ({ dirty: { ...s.dirty, [path]: false } }));
    },
    updaterPort: fakePort(events, {
      check: async () => {
        events.push("check");
        return fakeUpdate({
          install: async () => {
            events.push("install");
            dirtyAllInstall = { ...useStore.getState().dirty };
          },
        });
      },
      relaunch: async () => {
        events.push("relaunch");
      },
    }),
  });

  await useStore.getState().checkForUpdates();
  await useStore.getState().downloadUpdate();
  assert.equal(useStore.getState().update.phase, "ready");

  await useStore.getState().installUpdate();

  const installIdx = events.indexOf("install");
  const lastSaveIdx = Math.max(
    ...events.map((e, i) => (e.startsWith("save:") ? i : -1)),
  );
  assert.ok(installIdx > lastSaveIdx, `install avvenuta PRIMA dei salvataggi: ${events.join(" → ")}`);
  assert.ok(
    events.filter((e) => e.startsWith("save:")).includes("save:main.tex") &&
      events.filter((e) => e.startsWith("save:")).includes("save:note.tex"),
    `non tutti i file sporchi sono stati salvati: ${events.join(" → ")}`,
  );
  assert.equal(events.at(-1), "relaunch");
  // All'atto dell'installazione nessun file deve più essere sporco.
  assert.deepEqual(
    Object.values(dirtyAllInstall).filter(Boolean),
    [],
    `file ancora sporchi al momento dell'installazione: ${JSON.stringify(dirtyAllInstall)}`,
  );
});

// (d2) — se il salvataggio fallisce, l'installazione NON parte: mai perdere
// dati per un aggiornamento. In ambiente di test invoke non esiste, quindi il
// saveFile REALE fallisce in modo controllato (osservabile come riga di log
// «salvataggio fallito», stessa tecnica del test B0.2).
test("installazione con salvataggio fallito → error e install MAI chiamata", async () => {
  const events: string[] = [];
  resetUpdateState();
  useStore.setState({
    buffers: { "main.tex": "\\documentclass{article}" },
    dirty: { "main.tex": true },
    tabs: [{ path: "main.tex" }],
    activeTab: "main.tex",
    updaterPort: fakePort(events, {
      check: async () => {
        events.push("check");
        return fakeUpdate({
          install: async () => {
            events.push("install");
          },
        });
      },
      relaunch: async () => {
        events.push("relaunch");
      },
    }),
  });

  await useStore.getState().checkForUpdates();
  await useStore.getState().downloadUpdate();
  await useStore.getState().installUpdate();

  assert.equal(
    events.includes("install"),
    false,
    `l'installazione è partita comunque con un file non salvato: ${events.join(" → ")}`,
  );
  assert.equal(events.includes("relaunch"), false);
  // Il salvataggio è stato TENTATO: la riga di log lo dimostra (invoke
  // assente in ambiente di test).
  assert.ok(
    useStore.getState().buildLog.some((l) => l.text.includes("salvataggio fallito")),
    "il salvataggio dei buffer sporchi non è stato nemmeno tentato",
  );
  const st = useStore.getState().update;
  assert.equal(st.phase, "error");
  assert.ok(
    st.phase === "error" && st.message.includes("impossibile salvare"),
    `messaggio di installazione bloccata mancante: ${JSON.stringify(st)}`,
  );
  assert.equal(useStore.getState().dirty["main.tex"], true);
});

// Extra: resetUpdateUi riporta la UI a idle senza toccare l'adapter.
test("resetUpdateUi: torna a idle senza chiamare l'adapter", async () => {
  const calls: string[] = [];
  resetUpdateState();
  useStore.setState({ updaterPort: fakePort(calls) });
  useStore.setState({ update: { phase: "up-to-date" } });
  useStore.getState().resetUpdateUi();
  assert.equal(useStore.getState().update.phase, "idle");
  assert.deepEqual(calls, []);
});

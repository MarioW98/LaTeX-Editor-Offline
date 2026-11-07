/**
 * Test discriminanti M0.7.1 (wiring store) — il gate backend arriva alla UI
 * come DIALOG di guida, non come stringa grezza nel log
 * (si esegue con `npm test`, cioè `node --test`).
 *
 * Il backend ora rifiuta start_build con l'errore TIPIZZATO quando la
 * rilevazione strumenti dice che il toolchain non c'è (nessuno spawn
 * tentato). La rejection arriva qui come stringa (AppError serializza a
 * stringa): build() la passa a describeBuildStartError e:
 * - esito toolchain → dialog «Impossibile compilare» col messaggio
 *   azionabile (store.buildDialog), buildLog VUOTO;
 * - errore generico → riga di log come prima, NESSUN dialog.
 *
 * Punto di fallimento sulla versione naive: build() incolla
 * `avvio compilazione fallito: ${String(e)}` nel log per TUTTI gli errori
 * (il dialog non esiste e store.buildDialog non esiste).
 *
 * Nota tecnica: api.startBuild viene sostituita temporaneamente con un
 * fake che rilancia l'errore tipizzato (la stessa tecnica dei test esistenti
 * che sostituiscono updaterPort/saveFile), e ripristinata nel finally.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { api } from "../api.ts";
import { DEFAULT_PROJECT_SETTINGS } from "../types.ts";
import { useStore } from "./store.ts";

const originalStartBuild = api.startBuild;

function resetBuildState() {
  useStore.setState({
    rootPath: "/tmp/progetto-di-test",
    settings: { ...DEFAULT_PROJECT_SETTINGS },
    buildRunning: false,
    buildLog: [],
    lastBuildSuccess: null,
    outputOpen: true,
    buildDialog: null,
  });
}

test("start_build respinto dal gate → dialog di guida, NON la stringa grezza nel log", async () => {
  resetBuildState();
  try {
    api.startBuild = async () => {
      throw (
        "Nessuna distribuzione LaTeX trovata: per compilare serve MiKTeX o TeX Live " +
        "(vedi la sezione Requisiti del manuale). Dopo l'installazione riavvia l'app."
      );
    };
    await useStore.getState().build();

    const s = useStore.getState();
    assert.ok(s.buildDialog, "il dialog di guida non è stato aperto");
    assert.equal(s.buildDialog?.title, "Impossibile compilare");
    assert.ok(
      s.buildDialog?.body.includes("MiKTeX o TeX Live"),
      `il corpo del dialog non contiene la guida: ${JSON.stringify(s.buildDialog)}`,
    );
    assert.equal(s.buildRunning, false, "buildRunning resta acceso dopo il rifiuto");
    assert.ok(
      !s.buildLog.some((l) => l.text.includes("Nessuna distribuzione LaTeX trovata")),
      "la stringa del gate è finita nel log invece che nel dialog",
    );

    // Il dialog si chiude e lo store resta pienamente utilizzabile.
    useStore.getState().closeBuildDialog();
    assert.equal(useStore.getState().buildDialog, null);
  } finally {
    api.startBuild = originalStartBuild;
  }
});

test("start_build respinto per motore mancante → dialog di guida col nome del motore", async () => {
  resetBuildState();
  try {
    api.startBuild = async () => {
      throw (
        "La distribuzione LaTeX installata non include il motore xelatex: scegline " +
        "un altro disponibile (l'elenco degli strumenti è nella barra di stato, alla " +
        "voce «LaTeX») oppure installa il pacchetto corrispondente (vedi la sezione " +
        "Requisiti del manuale)."
      );
    };
    await useStore.getState().build();
    const s = useStore.getState();
    assert.equal(s.buildDialog?.title, "Impossibile compilare");
    assert.ok(s.buildDialog?.body.includes("xelatex"));
    assert.ok(!s.buildLog.some((l) => l.text.includes("non include il motore")));
  } finally {
    api.startBuild = originalStartBuild;
  }
});

test("errore generico di avvio → riga di log come prima, NESSUN dialog", async () => {
  resetBuildState();
  try {
    api.startBuild = async () => {
      throw new Error("una compilazione è già in corso");
    };
    await useStore.getState().build();
    const s = useStore.getState();
    assert.equal(s.buildDialog, null, "l'errore generico non deve aprire il dialog");
    assert.ok(
      s.buildLog.some((l) => l.kind === "error" && l.text.includes("una compilazione è già in corso")),
      `la riga di log dell'errore generico manca: ${JSON.stringify(s.buildLog)}`,
    );
    assert.equal(s.buildRunning, false);
  } finally {
    api.startBuild = originalStartBuild;
  }
});

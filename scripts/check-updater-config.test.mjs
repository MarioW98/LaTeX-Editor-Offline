/**
 * Test discriminante MU.2 — validazione della configurazione updater
 * (si esegue con `npm test`, cioè `node --test`).
 *
 * La CI deve rifiutare la build quando la configurazione updater non è
 * completa: in particolare la pubkey minisign del maintainer è nel formato
 * giusto (base64, 48 caratteri, prefisso RW). Con il segnaposto la CI resta
 * volutamente rossa: meglio rosso che un updater che non verifica le firme.
 *
 * Punto di fallimento sulla versione naive (nessuna validazione): il test
 * 'pubkey non valida viene segnalata' fallisce perché nessun problema viene
 * rilevato e la build proseguirebbe verso artifact non verificabili.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXPECTED_ENDPOINT,
  MINISIGN_PUBKEY_RE,
  collectUpdaterConfigProblems,
} from "./check-updater-config.mjs";

const VALID_PUBKEY = `RW${"A".repeat(46)}`;

function validConf() {
  return {
    bundle: { createUpdaterArtifacts: true },
    plugins: { updater: { pubkey: VALID_PUBKEY, endpoints: [EXPECTED_ENDPOINT] } },
  };
}

test("configurazione valida: nessun problema", () => {
  assert.deepEqual(collectUpdaterConfigProblems(validConf()), []);
});

test("pubkey non valida viene segnalata (segnaposto, vuota, formato sbagliato)", () => {
  for (const pubkey of ["REPLACE_WITH_MAINTAINER_PUBKEY", "", "RW-PICCOLA", `RW${"A".repeat(45)}`, "XX123"]) {
    const conf = validConf();
    conf.plugins.updater.pubkey = pubkey;
    const problems = collectUpdaterConfigProblems(conf);
    assert.ok(
      problems.some((p) => p.includes("pubkey non è una pubkey minisign valida")),
      `pubkey ${JSON.stringify(pubkey)} non segnalata: ${problems.join("; ")}`,
    );
    // Il messaggio deve dire COSA sostituire quando c'è il segnaposto.
    if (pubkey === "REPLACE_WITH_MAINTAINER_PUBKEY") {
      assert.ok(problems.some((p) => p.includes("sostituisci il segnaposto")));
    }
  }
  // La pubkey del maintainer ha il formato minisign atteso (48 caratteri, prefisso RW).
  assert.ok(MINISIGN_PUBKEY_RE.test(VALID_PUBKEY));
  assert.equal(VALID_PUBKEY.length, 48);
});

test("createUpdaterArtifacts assente o false viene segnalato", () => {
  for (const value of [undefined, false]) {
    const conf = validConf();
    conf.bundle.createUpdaterArtifacts = value;
    assert.ok(
      collectUpdaterConfigProblems(conf).some((p) => p.includes("createUpdaterArtifacts")),
      `createUpdaterArtifacts=${value} non segnalato`,
    );
  }
});

test("endpoint diverso da quello del rilascio versionato viene segnalato", () => {
  for (const endpoints of [
    undefined,
    [],
    ["https://example.org/latest.json"],
    [EXPECTED_ENDPOINT, "https://secondo-endpoint.example/latest.json"],
  ]) {
    const conf = validConf();
    conf.plugins.updater.endpoints = endpoints;
    assert.ok(
      collectUpdaterConfigProblems(conf).some((p) => p.includes("plugins.updater.endpoints")),
      `endpoints ${JSON.stringify(endpoints)} non segnalati`,
    );
  }
});

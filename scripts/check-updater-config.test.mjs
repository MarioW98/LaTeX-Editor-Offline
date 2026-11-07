/**
 * Test discriminanti MU.2 + M0.6.4 — validazione della configurazione updater
 * (si esegue con `npm test`, cioè `node --test`).
 *
 * La CI deve rifiutare la build quando la configurazione updater non è
 * completa. In particolare la pubkey minisign del maintainer deve essere nel
 * formato reale che `tauri signer generate` scrive nel file .pub e che va
 * incollata in plugins.updater.pubkey: UNA sola riga base64 (152 caratteri)
 * che decodifica nel file a due righe
 *   untrusted comment: minisign public key: <16 caratteri esadecimali MAIUSCOLI>
 *   RW<54 caratteri base64>
 * con al più un newline finale.
 *
 * Punti di fallimento sulla versione naive (regex "RW" + 46 caratteri):
 * 'configurazione valida: nessun problema', 'pubkey nel formato minisign
 * reale viene accettata' e 'il vecchio formato inventato (48 caratteri RW…)
 * viene respinto' — il validatore naive respinge la chiave vera e accetta
 * quella sbagliata.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXPECTED_ENDPOINT,
  collectUpdaterConfigProblems,
} from "./check-updater-config.mjs";

/**
 * Riga chiave minisign realistica: base64 dei 42 byte
 * "Ed" (algoritmo) + keyid 8 byte + chiave Ed25519 32 byte → 56 caratteri.
 */
function minisignKeyLine(keyIdHex = "ABCDEF0123456789") {
  return Buffer.concat([
    Buffer.from("Ed", "ascii"),
    Buffer.from(keyIdHex, "hex"),
    Buffer.alloc(32, 0xab),
  ]).toString("base64");
}

/** Pubkey reale: UNA riga base64 che decodifica nel file .pub a due righe. */
function realPubkey({
  trailingNewline = true,
  comment = "untrusted comment: minisign public key: ABCDEF0123456789",
  keyLine = minisignKeyLine(),
} = {}) {
  return Buffer.from(`${comment}\n${keyLine}${trailingNewline ? "\n" : ""}`, "utf8").toString(
    "base64",
  );
}

const VALID_PUBKEY = realPubkey();

function validConf() {
  return {
    bundle: { createUpdaterArtifacts: true },
    plugins: { updater: { pubkey: VALID_PUBKEY, endpoints: [EXPECTED_ENDPOINT] } },
  };
}

/** Configurazione valida con `pubkey` sostituita: ritorna i problemi rilevati. */
function pubkeyProblems(pubkey) {
  const conf = validConf();
  conf.plugins.updater.pubkey = pubkey;
  return collectUpdaterConfigProblems(conf);
}

test("la pubkey di prova è nel formato reale: base64 di 152 caratteri del .pub a due righe", () => {
  assert.equal(VALID_PUBKEY.length, 152);
  assert.match(VALID_PUBKEY, /^[A-Za-z0-9+/]+={0,2}$/);
  const decoded = Buffer.from(VALID_PUBKEY, "base64").toString("utf8");
  assert.match(
    decoded,
    /^untrusted comment: minisign public key: ABCDEF0123456789\nRW[A-Za-z0-9+/]{54}\n$/,
  );
});

test("configurazione valida: nessun problema", () => {
  assert.deepEqual(collectUpdaterConfigProblems(validConf()), []);
});

test("pubkey nel formato minisign reale viene accettata", () => {
  assert.deepEqual(pubkeyProblems(realPubkey()), []);
  // Il newline finale del .pub è facoltativo.
  assert.deepEqual(pubkeyProblems(realPubkey({ trailingNewline: false })), []);
});

test("il vecchio formato inventato (48 caratteri RW…) viene respinto", () => {
  const problems = pubkeyProblems(`RW${"A".repeat(46)}`);
  assert.ok(
    problems.some((p) => p.includes("pubkey non è una pubkey minisign valida")),
    `pubkey inventata non segnalata: ${problems.join("; ")}`,
  );
  // Il motivo deve essere strutturale: decodificata non è un file .pub minisign.
  assert.ok(
    problems.some((p) => p.includes("riga di commento minisign")),
    `il messaggio deve indicare la riga di commento mancante: ${problems.join("; ")}`,
  );
});

test("segnaposto REPLACE_WITH_MAINTAINER_PUBKEY respinto, con l'hint su cosa incollare", () => {
  const problems = pubkeyProblems("REPLACE_WITH_MAINTAINER_PUBKEY");
  assert.ok(
    problems.some((p) => p.includes("pubkey non è una pubkey minisign valida")),
    `segnaposto non segnalato: ${problems.join("; ")}`,
  );
  assert.ok(
    problems.some((p) => p.includes("sostituisci il segnaposto")),
    `manca l'hint per il segnaposto: ${problems.join("; ")}`,
  );
});

test("pubkey che non è base64 valido viene respinta", () => {
  for (const [label, pubkey] of [
    ["spazio interno", "dW50cnVzdGVkIGNvbW1lbnQ6 IHB1YmxpYw=="],
    ["carattere fuori charset", "dW50cnVzdGVkIGNvbW1lbnQ6!"],
    ["lunghezza non multipla di 4", "dW50cnVzdGVkIGNvbW1lbnQ6AAA"],
  ]) {
    const problems = pubkeyProblems(pubkey);
    assert.ok(
      problems.some((p) => p.includes("non è base64 valido")),
      `pubkey ${label} (${JSON.stringify(pubkey)}) respinta con motivo sbagliato: ${problems.join("; ")}`,
    );
  }
});

test("pubkey assente, vuota o non stringa viene respinta", () => {
  for (const pubkey of [undefined, null, 42, ""]) {
    const problems = pubkeyProblems(pubkey);
    assert.ok(
      problems.some((p) => p.includes("pubkey assente o vuota")),
      `pubkey ${String(pubkey)} non segnalata come assente/non stringa: ${problems.join("; ")}`,
    );
  }
});

test("base64 valido che decodifica in garbage viene respinto", () => {
  const garbage = Buffer.from(
    "questo file non è una chiave minisign: solo garbage",
    "utf8",
  ).toString("base64");
  const problems = pubkeyProblems(garbage);
  assert.ok(
    problems.some((p) => p.includes("riga di commento minisign")),
    `garbage non respinto con motivo strutturale: ${problems.join("; ")}`,
  );
});

test("struttura della riga di commento errata viene respinta", () => {
  // Variante minisign classica senza i due punti dopo "key": non è il
  // formato che `tauri signer generate` mette in plugins.updater.pubkey.
  const noColon = pubkeyProblems(
    realPubkey({ comment: "untrusted comment: minisign public key ABCDEF0123456789" }),
  );
  assert.ok(
    noColon.some((p) => p.includes("non inizia con la riga di commento minisign")),
    `commento senza due punti non respinto come previsto: ${noColon.join("; ")}`,
  );
  for (const [label, keyId] of [
    ["esadecimale minuscolo", "abcdef0123456789"],
    ["non esadecimale", "ZZZZZZZZZZZZZZZZ"],
    ["di 15 caratteri", "ABCDEF012345678"],
  ]) {
    const problems = pubkeyProblems(
      realPubkey({ comment: `untrusted comment: minisign public key: ${keyId}` }),
    );
    assert.ok(
      problems.some((p) => p.includes("esadecimali MAIUSCOLI")),
      `KEYID ${label} (${keyId}) non respinto come previsto: ${problems.join("; ")}`,
    );
  }
});

test("riga della chiave errata viene respinta", () => {
  for (const [label, keyLine, reason] of [
    ["di 55 caratteri", `RW${"q".repeat(53)}`, 'deve essere "RW" + 54 caratteri base64'],
    ["di 57 caratteri", `RW${"q".repeat(55)}`, 'deve essere "RW" + 54 caratteri base64'],
    ["senza prefisso RW", `rw${"q".repeat(54)}`, 'deve essere "RW" + 54 caratteri base64'],
    ["assente (solo commento)", "", "manca la riga della chiave"],
    [
      "seguita da una terza riga",
      `${minisignKeyLine()}\nriga in piu`,
      "righe aggiuntive",
    ],
    ["con doppio newline finale", `${minisignKeyLine()}\n`, "righe aggiuntive"],
  ]) {
    const problems = pubkeyProblems(realPubkey({ keyLine }));
    assert.ok(
      problems.some((p) => p.includes("riga della chiave") && p.includes(reason)),
      `riga chiave ${label} non respinta come previsto: ${problems.join("; ")}`,
    );
  }
});

test("il .pub in chiaro (due righe, non codificato base64) viene respinto", () => {
  const raw = `untrusted comment: minisign public key: ABCDEF0123456789\n${minisignKeyLine()}\n`;
  const problems = pubkeyProblems(raw);
  assert.ok(
    problems.some((p) => p.includes("non è base64 valido")),
    `.pub in chiaro non respinto come non-base64: ${problems.join("; ")}`,
  );
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

/**
 * Test discriminante B0.5.1 — versione a fonte singola
 * (si esegue con `npm test`, cioè `node --test`).
 *
 * La versione dell'app deve vivere SOLO in src-tauri/tauri.conf.json e
 * rispecchiarsi intatta su package.json, package-lock.json, Cargo.toml e
 * Cargo.lock. Il difetto del codice precedente: la versione era scritta a
 * mano nei tre posti principali e restava ferma a 0.1.0, quindi un .msi con
 * versione uguale a quella installata non aggiorna (rito disinstalla/installa).
 *
 * Punti di fallimento sulla versione naive (nessuna sincronizzazione, o una
 * sincronizzazione naive che rimpiazza TUTTE le righe "version"):
 *   - "package-lock: tocca solo le due versioni della radice" fallisce se una
 *     dipendenza con la stessa versione dell'app viene riscritta (replace-all);
 *   - "Cargo.toml: solo la sezione [package]" fallisce se cambia anche il
 *     campo version di una dipendenza;
 *   - "computeSyncPlan segnala la divergenza" fallisce se il confronto non
 *     esiste: i file restano fuori sync senza che nulla lo rilevi (la CI
 *     resterebbe verde e il bumpererebbe prodotto versioni incoerenti).
 *
 * M0.6.1 — varianti CRLF: il checkout su un runner Windows (core.autocrlf)
 * produce file CRLF, quindi OGNI regex di riga deve tollerare il "\r" e
 * l'output deve conservare byte per byte i fine riga di ingresso.
 *
 * Verifica empirica del punto di rottura sul naive: in JavaScript multilinea
 * "$" matcha anche prima di "\r" (ECMAScript conta \r come terminatore di
 * riga), quindi le regex ancorate a "$" sopravvivono a CRLF per semantica
 * della spec; ciò che rende rosso lo step CI su Windows è la regex di riga
 * con separatori LETTERALI "\n" del percorso Cargo.lock
 * (syncCargoLockText): su testo CRLF non matcha affatto e lancia
 * 'Cargo.lock: blocco [[package]] latex-editor-offline non trovato'.
 * I test CRLF di Cargo.lock e computeSyncPlan sono ROSSI sul naive in quel
 * punto; gli altri CRLF (package.json/lock, Cargo.toml) passano sul naive
 * per la semantica "$"-prima-di-\r e devono RESTARE verdi dopo il fix:
 * la tolleranza (\r?) rende esplicito e uniforme ciò che oggi è implicito.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  computeSyncPlan,
  extractAppVersion,
  syncCargoLockText,
  syncCargoTomlText,
  syncPackageJsonText,
  syncPackageLockText,
} from "./sync-version.mjs";

test("extractAppVersion: legge e valida la versione di tauri.conf.json", () => {
  assert.equal(extractAppVersion(JSON.stringify({ version: "0.2.0" })), "0.2.0");
  assert.equal(extractAppVersion('{\n  "version": "1.2.3"\n}\n'), "1.2.3");
  // Versione assente o non semver: errore esplicito, mai silenzio.
  assert.throws(() => extractAppVersion("{}"), /version/);
  assert.throws(() => extractAppVersion(JSON.stringify({ version: "0.2" })), /semver/);
  assert.throws(() => extractAppVersion(JSON.stringify({ version: "v0.2.0" })), /semver/);
  assert.throws(() => extractAppVersion("non sono json"), /JSON/);
});

test("package.json: la riga version della radice viene sostituita (idempotente)", () => {
  const pkg = `{
  "name": "latex-editor-offline",
  "private": true,
  "version": "0.1.0",
  "type": "module"
}
`;
  const out = syncPackageJsonText(pkg, "0.2.0");
  assert.match(out, /"version": "0.2.0"/);
  assert.doesNotMatch(out, /"version": "0.1.0"/);
  // Identità: risincronizzare un file già sincronizzato non cambia nulla.
  assert.equal(syncPackageJsonText(out, "0.2.0"), out);
});

test("package-lock: tocca solo le due versioni della radice, mai quelle delle dipendenze", () => {
  // left-pad ha per caso la STESSA versione della vecchia app: non deve
  // essere toccata (è la trappola del replace-all).
  const lock = `{
  "name": "latex-editor-offline",
  "version": "0.1.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "latex-editor-offline",
      "version": "0.1.0",
      "dependencies": {
        "left-pad": "^0.1.0"
      }
    },
    "node_modules/left-pad": {
      "version": "0.1.0"
    }
  }
}
`;
  const out = syncPackageLockText(lock, "0.2.0");
  // Esattamente DUE righe diventate 0.2.0: top-level e packages[""].
  assert.equal((out.match(/"version": "0.2.0"/g) ?? []).length, 2);
  // La dipendenza resta a 0.1.0.
  assert.match(out, /"node_modules\/left-pad": \{\n      "version": "0.1.0"/);
  assert.equal(syncPackageLockText(out, "0.2.0"), out);
});

test("Cargo.toml: solo il version della sezione [package], le dipendenze non si toccano", () => {
  const toml = `[package]
name = "latex-editor-offline"
version = "0.1.0"
description = "Offline-first LaTeX desktop editor"
license = "MIT"

[dependencies]
tauri = { version = "2", features = [] }
tempfile = "3"
`;
  const out = syncCargoTomlText(toml, "0.2.0");
  assert.match(out, /^version = "0.2.0"$/m);
  // Le dipendenze conservano le proprie versioni.
  assert.match(out, /tauri = \{ version = "2", features = \[\] \}/);
  assert.match(out, /tempfile = "3"/);
  assert.equal(syncCargoTomlText(out, "0.2.0"), out);
});

test("Cargo.lock: solo il blocco [[package]] latex-editor-offline cambia", () => {
  const lock = `# This file is automatically @generated by Cargo.
version = 3

[[package]]
name = "left-pad"
version = "0.1.0"

[[package]]
name = "latex-editor-offline"
version = "0.1.0"
dependencies = [
 "left-pad",
]
`;
  const out = syncCargoLockText(lock, "0.2.0");
  assert.match(out, /name = "latex-editor-offline"\nversion = "0.2.0"/);
  // L'altra crate con la stessa versione resta com'era.
  assert.match(out, /name = "left-pad"\nversion = "0.1.0"/);
  assert.equal(syncCargoLockText(out, "0.2.0"), out);
});

test("computeSyncPlan: segnala la divergenza e torna pulito dopo la sincronizzazione", () => {
  // Riproduco in una cartella temporanea la geometria reale del repo,
  // con i file derivati ancora alla VECCHIA versione.
  const root = mkdtempSync(path.join(tmpdir(), "sync-version-test-"));
  try {
    mkdirSync(path.join(root, "src-tauri"), { recursive: true });
    writeFileSync(
      path.join(root, "src-tauri/tauri.conf.json"),
      JSON.stringify({ productName: "LaTeX Editor Offline", version: "0.2.0" }, null, 2) + "\n",
    );
    writeFileSync(path.join(root, "package.json"), `{\n  "name": "latex-editor-offline",\n  "version": "0.1.0"\n}\n`);
    writeFileSync(
      path.join(root, "package-lock.json"),
      `{\n  "name": "latex-editor-offline",\n  "version": "0.1.0",\n  "packages": {\n    "": {\n      "version": "0.1.0"\n    }\n  }\n}\n`,
    );
    writeFileSync(
      path.join(root, "src-tauri/Cargo.toml"),
      `[package]\nname = "latex-editor-offline"\nversion = "0.1.0"\n\n[dependencies]\n`,
    );
    writeFileSync(
      path.join(root, "src-tauri/Cargo.lock"),
      `[[package]]\nname = "latex-editor-offline"\nversion = "0.1.0"\n`,
    );

    // Sul codice naive (nessun controllo di coerenza) la divergenza non
    // verrebbe rilevata da nessuno: qui deve invece risultare a verbale.
    let plan = computeSyncPlan(root);
    assert.equal(plan.version, "0.2.0");
    assert.equal(
      plan.changes.length,
      4,
      `divergenza non rilevata su: ${plan.changes.map((c) => c.rel).join(", ")}`,
    );

    // Applico il piano (come farebbe main() in scrittura) e ricontrollo.
    for (const c of plan.changes) writeFileSync(c.path, c.synced);
    plan = computeSyncPlan(root);
    assert.equal(plan.changes.length, 0, "file ancora fuori sync dopo l'applicazione");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// M0.6.1 — varianti CRLF (checkout di git su Windows, core.autocrlf).
// L'invariante: le funzioni di sincronizzazione funzionano IDENTICAMENTE su
// testo LF e CRLF, e il testo CRLF esce CRLF byte per byte (nessun \r perso,
// nessun \n introdotto), restando idempotenti.
// ---------------------------------------------------------------------------

/** Converte un template LF in CRLF byte per byte. */
function toCrlf(text) {
  return text.replace(/\n/g, "\r\n");
}

/** Un file CRLF non deve contenere nessun \n non preceduto da \r. */
function assertAllCrlf(text, label) {
  assert.ok(
    !/(?<!\r)\n/.test(text),
    `${label}: contiene fine riga LF in un file CRLF (fine riga non conservati byte per byte)`,
  );
}

test("CRLF: package.json radice sostituita, fine riga conservati, idempotente", () => {
  const pkg = toCrlf(`{
  "name": "latex-editor-offline",
  "private": true,
  "version": "0.1.0",
  "type": "module"
}
`);
  const out = syncPackageJsonText(pkg, "0.2.0");
  // La riga version del package.json reale è a metà file: termina con la
  // virgola, che deve restare prima del fine riga conservato.
  assert.match(out, /"version": "0.2.0",\r$/m);
  assert.doesNotMatch(out, /"version": "0.1.0"/);
  assertAllCrlf(out, "package.json");
  assert.equal(syncPackageJsonText(out, "0.2.0"), out);
});

test("CRLF: package-lock, solo le DUE radici, dipendenza intatta, idempotente", () => {
  const lock = toCrlf(`{
  "name": "latex-editor-offline",
  "version": "0.1.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "latex-editor-offline",
      "version": "0.1.0",
      "dependencies": {
        "left-pad": "^0.1.0"
      }
    },
    "node_modules/left-pad": {
      "version": "0.1.0"
    }
  }
}
`);
  const out = syncPackageLockText(lock, "0.2.0");
  assert.equal((out.match(/"version": "0.2.0"/g) ?? []).length, 2);
  assert.match(out, /"node_modules\/left-pad": \{\r\n      "version": "0.1.0"/);
  assertAllCrlf(out, "package-lock");
  assert.equal(syncPackageLockText(out, "0.2.0"), out);
});

test("CRLF: Cargo.toml, solo la sezione [package], fine riga conservati", () => {
  const toml = toCrlf(`[package]
name = "latex-editor-offline"
version = "0.1.0"
description = "Offline-first LaTeX desktop editor"
license = "MIT"

[dependencies]
tauri = { version = "2", features = [] }
tempfile = "3"
`);
  const out = syncCargoTomlText(toml, "0.2.0");
  assert.match(out, /^version = "0.2.0"\r$/m);
  assert.match(out, /tauri = \{ version = "2", features = \[\] \}/);
  assert.match(out, /tempfile = "3"/);
  assertAllCrlf(out, "Cargo.toml");
  assert.equal(syncCargoTomlText(out, "0.2.0"), out);
});

test("CRLF: Cargo.lock, solo il blocco latex-editor-offline, fine riga conservati", () => {
  const lock = toCrlf(`# This file is automatically @generated by Cargo.
version = 3

[[package]]
name = "left-pad"
version = "0.1.0"

[[package]]
name = "latex-editor-offline"
version = "0.1.0"
dependencies = [
 "left-pad",
]
`);
  const out = syncCargoLockText(lock, "0.2.0");
  assert.match(out, /name = "latex-editor-offline"\r\nversion = "0.2.0"/);
  assert.match(out, /name = "left-pad"\r\nversion = "0.1.0"/);
  assertAllCrlf(out, "Cargo.lock");
  assert.equal(syncCargoLockText(out, "0.2.0"), out);
});

test("CRLF: computeSyncPlan rileva la divergenza, sincronizza e RESTA CRLF", () => {
  const root = mkdtempSync(path.join(tmpdir(), "sync-version-crlf-test-"));
  try {
    mkdirSync(path.join(root, "src-tauri"), { recursive: true });
    writeFileSync(
      path.join(root, "src-tauri/tauri.conf.json"),
      toCrlf(JSON.stringify({ productName: "LaTeX Editor Offline", version: "0.2.0" }, null, 2) + "\n"),
    );
    writeFileSync(
      path.join(root, "package.json"),
      toCrlf(`{\n  "name": "latex-editor-offline",\n  "version": "0.1.0"\n}\n`),
    );
    writeFileSync(
      path.join(root, "package-lock.json"),
      toCrlf(`{\n  "name": "latex-editor-offline",\n  "version": "0.1.0",\n  "packages": {\n    "": {\n      "version": "0.1.0"\n    }\n  }\n}\n`),
    );
    writeFileSync(
      path.join(root, "src-tauri/Cargo.toml"),
      toCrlf(`[package]\nname = "latex-editor-offline"\nversion = "0.1.0"\n\n[dependencies]\n`),
    );
    writeFileSync(
      path.join(root, "src-tauri/Cargo.lock"),
      toCrlf(`[[package]]\nname = "latex-editor-offline"\nversion = "0.1.0"\n`),
    );

    // Sul naive questo punto NON viene raggiunto: la regex ancorata senza
    // (\r?) non matcha e computeSyncPlan lancia
    // 'package.json: nessuna riga "version": "…" trovata'.
    const plan = computeSyncPlan(root);
    assert.equal(plan.version, "0.2.0");
    assert.equal(
      plan.changes.length,
      4,
      `divergenza non rilevata su: ${plan.changes.map((c) => c.rel).join(", ")}`,
    );

    for (const c of plan.changes) writeFileSync(c.path, c.synced);
    const after = computeSyncPlan(root);
    assert.equal(after.changes.length, 0, "file ancora fuori sync dopo l'applicazione");
    // Il testo CRLF esce CRLF byte per byte, file per file.
    for (const rel of ["package.json", "package-lock.json", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock"]) {
      assertAllCrlf(readFileSync(path.join(root, rel), "utf8"), rel);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";
import { GATES } from "./verify.mjs";

/**
 * M0.6.5 — Il gate locale deve replicare ESATTAMENTE le porte che la CI
 * apre prima della build, nello stesso ordine. Questi test discriminano
 * qualsiasi deriva: un comando cambiato, una porta rimossa o riordinata
 * rende il gate locale non più equivalente alla CI e va rosso.
 */

test("il gate incatena esattamente le sei porte della CI, nell'ordine", () => {
  assert.deepEqual(
    GATES.map((g) => g.id),
    [
      "sync-version",
      "updater-config",
      "typecheck",
      "frontend-tests",
      "cargo-test",
      "cargo-clippy",
    ],
  );
});

test("porta 1: sync-version in modalità --check, senza riscrivere i file", () => {
  assert.equal(GATES[0].command, process.execPath);
  assert.deepEqual(GATES[0].args, ["scripts/sync-version.mjs", "--check"]);
});

test("porta 2: validazione della configurazione updater", () => {
  assert.equal(GATES[1].command, process.execPath);
  assert.deepEqual(GATES[1].args, ["scripts/check-updater-config.mjs"]);
});

test("porta 3: typecheck senza produrre dist", () => {
  assert.equal(GATES[2].command, process.execPath);
  assert.deepEqual(GATES[2].args, [
    path.join("node_modules", "typescript", "bin", "tsc"),
    "--noEmit",
  ]);
});

test("porta 4: test frontend e script con il runner di Node", () => {
  assert.equal(GATES[3].command, process.execPath);
  assert.deepEqual(GATES[3].args, [
    "--test",
    "--experimental-strip-types",
    "src/**/*.test.ts",
    "scripts/**/*.test.mjs",
  ]);
});

test("porta 5: test Rust sul manifest dell'app", () => {
  assert.equal(GATES[4].command, "cargo");
  assert.deepEqual(GATES[4].args, ["test", "--manifest-path", "src-tauri/Cargo.toml"]);
});

test("porta 6: clippy su tutti i target con warnings come errori", () => {
  assert.equal(GATES[5].command, "cargo");
  assert.deepEqual(GATES[5].args, [
    "clippy",
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "--all-targets",
    "--",
    "-D",
    "warnings",
  ]);
});

test("package.json espone il gate come «npm run verify»", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.scripts.verify, "node scripts/verify.mjs");
});

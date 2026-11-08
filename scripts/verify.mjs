#!/usr/bin/env node
/**
 * M0.6.5 — Gate locale di verifica: «npm run verify».
 *
 * Incatena, fermandosi alla PRIMA porta che fallisce, le stesse verifiche
 * che la CI (.github/workflows/build.yml) apre prima della build:
 *
 *   1. coerenza della versione:   node scripts/sync-version.mjs --check
 *   2. configurazione updater:    node scripts/check-updater-config.mjs
 *   3. typecheck TypeScript:      tsc --noEmit
 *   4. test frontend e script:    node --test --experimental-strip-types
 *                                     (stessi glob dello script «test»)
 *   5. test Rust:                 cargo test --manifest-path src-tauri/Cargo.toml
 *   6. lint Rust:                 cargo clippy --manifest-path src-tauri/Cargo.toml
 *                                     --all-targets -- -D warnings
 *
 * Quando una porta fallisce, l'output dice QUALE ed esce con codice 1: il
 * gate si esegue in locale PRIMA di OGNI push, così un rosso CI lo scopre
 * chi lo causa e non la build pubblica.
 *
 * Comandi assenti dal sistema (per esempio «cargo» senza toolchain Rust)
 * vengono riportati come porta fallita con un messaggio esplicito, non come
 * crash dello script. Nessuna dipendenza oltre a Node (>= 22).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Entrata del compilatore TypeScript locale: gira con lo stesso Node dello script. */
const TSC_ENTRY = path.join("node_modules", "typescript", "bin", "tsc");

/**
 * Le porte, nell'ordine in cui la CI le apre prima della build. Ogni voce
 * porta il comando esatto della CI: il gate lo replica in locale, niente di
 * più e niente di meno.
 */
export const GATES = [
  {
    id: "sync-version",
    title: "coerenza della versione",
    hint: "node scripts/sync-version.mjs --check",
    command: process.execPath,
    args: ["scripts/sync-version.mjs", "--check"],
  },
  {
    id: "updater-config",
    title: "configurazione updater (pubkey minisign)",
    hint: "node scripts/check-updater-config.mjs",
    command: process.execPath,
    args: ["scripts/check-updater-config.mjs"],
  },
  {
    id: "typecheck",
    title: "typecheck TypeScript",
    hint: "tsc --noEmit",
    command: process.execPath,
    args: [TSC_ENTRY, "--noEmit"],
  },
  {
    id: "frontend-tests",
    title: "test frontend e script Node",
    hint: 'node --test --experimental-strip-types "src/**/*.test.ts" "scripts/**/*.test.mjs"',
    command: process.execPath,
    args: [
      "--test",
      "--experimental-strip-types",
      "src/**/*.test.ts",
      "scripts/**/*.test.mjs",
    ],
  },
  {
    id: "cargo-test",
    title: "test Rust",
    hint: "cargo test --manifest-path src-tauri/Cargo.toml",
    command: "cargo",
    args: ["test", "--manifest-path", "src-tauri/Cargo.toml"],
  },
  {
    id: "cargo-clippy",
    title: "lint Rust (clippy, warnings come errori)",
    hint: "cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings",
    command: "cargo",
    args: [
      "clippy",
      "--manifest-path",
      "src-tauri/Cargo.toml",
      "--all-targets",
      "--",
      "-D",
      "warnings",
    ],
  },
];

/** Esegue una porta e ne restituisce l'esito grezzo di spawnSync. */
export function runGate(gate) {
  return spawnSync(gate.command, gate.args, { cwd: REPO_ROOT, stdio: "inherit" });
}

/** Motivo leggibile del fallimento di una porta. */
function failureReason(result) {
  if (result.error) {
    return `comando non avviabile: ${result.error.message}`;
  }
  if (result.signal) {
    return `terminato dal segnale ${result.signal}`;
  }
  return `uscito con codice ${result.status}`;
}

export function main() {
  if (!existsSync(path.join(REPO_ROOT, TSC_ENTRY))) {
    console.error(
      "Dipendenze frontend non installate: esegui «npm install» prima di «npm run verify».",
    );
    process.exit(1);
  }
  for (const [index, gate] of GATES.entries()) {
    const n = index + 1;
    console.log(`\n--- Porta ${n}/${GATES.length}: ${gate.title} — ${gate.hint}`);
    const result = runGate(gate);
    if (result.error || result.signal || result.status !== 0) {
      console.error(`\nPORTA FALLITA ${n}/${GATES.length}: ${gate.title}`);
      console.error(`  comando: ${gate.hint}`);
      console.error(`  esito: ${failureReason(result)}`);
      console.error("  npm run verify si ferma qui: correggi e ripeti prima del push.");
      process.exit(1);
    }
  }
  console.log(
    `\nVerifica completa: ${GATES.length}/${GATES.length} porte verdi. Pronto per il push.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

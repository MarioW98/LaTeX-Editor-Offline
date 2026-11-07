#!/usr/bin/env node
/**
 * MU.2 — validazione CI della configurazione updater in src-tauri/tauri.conf.json.
 *
 * Controlla, prima di buildare:
 *   - bundle.createUpdaterArtifacts = true;
 *   - UN solo endpoint, quello del rilascio VERSIONATO;
 *   - pubkey minisign del maintainer nel formato giusto (base64, 48
 *     caratteri, inizia per "RW").
 *
 * Con il segnaposto REPLACE_WITH_MAINTAINER_PUBKEY la CI FALLISCE di
 * proposito: meglio rosso in CI che un updater che non verifica le firme a
 * casa dell'utente. Nessuna dipendenza (Node >= 22).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const EXPECTED_ENDPOINT =
  "https://github.com/MarioW98/LaTeX-Editor-Offline/releases/latest/download/latest.json";

/** Chiave pubblica minisign: base64 di 36 byte = 48 caratteri che iniziano per "RW". */
export const MINISIGN_PUBKEY_RE = /^RW[A-Za-z0-9+/]{46}$/;

/** Ritorna l'elenco (possibilmente vuoto) dei problemi della configurazione. */
export function collectUpdaterConfigProblems(conf) {
  const problems = [];
  if (!conf || typeof conf !== "object") return ["tauri.conf.json non è un oggetto"];
  if (conf?.bundle?.createUpdaterArtifacts !== true) {
    problems.push(
      "bundle.createUpdaterArtifacts deve essere true: senza artifact firmati l'updater non ha nulla da verificare",
    );
  }
  const endpoints = conf?.plugins?.updater?.endpoints;
  if (!Array.isArray(endpoints) || endpoints.length !== 1 || endpoints[0] !== EXPECTED_ENDPOINT) {
    problems.push(
      `plugins.updater.endpoints deve essere esattamente ["${EXPECTED_ENDPOINT}"] ` +
        "(l'endpoint ufficiale releases/latest salta le prerelease: gli update arrivano SOLO dai tag v*)",
    );
  }
  const pubkey = conf?.plugins?.updater?.pubkey;
  if (typeof pubkey !== "string" || !MINISIGN_PUBKEY_RE.test(pubkey)) {
    const hint = String(pubkey).includes("REPLACE_WITH")
      ? " — sostituisci il segnaposto con la pubkey minisign reale del maintainer (minisign -G, inizia per RW)"
      : "";
    problems.push(
      `plugins.updater.pubkey non è una pubkey minisign valida (base64, 48 caratteri, prefisso RW): ${JSON.stringify(pubkey)}${hint}`,
    );
  }
  return problems;
}

export function main() {
  const confPath = path.join(REPO_ROOT, "src-tauri/tauri.conf.json");
  let conf;
  try {
    conf = JSON.parse(readFileSync(confPath, "utf8"));
  } catch (e) {
    console.error(`tauri.conf.json non leggibile o non valido: ${e.message}`);
    process.exit(1);
  }
  const problems = collectUpdaterConfigProblems(conf);
  if (problems.length > 0) {
    console.error("Configurazione updater non pronta per la build di rilascio:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(
    "OK: configurazione updater valida (createUpdaterArtifacts, endpoint del rilascio versionato, pubkey minisign).",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

#!/usr/bin/env node
/**
 * Validazione CI della configurazione updater in src-tauri/tauri.conf.json.
 *
 * Controlla, prima di buildare:
 *   - bundle.createUpdaterArtifacts = true;
 *   - UN solo endpoint, quello del rilascio VERSIONATO;
 *   - pubkey minisign del maintainer nel formato reale di Tauri.
 *
 * Contratto della pubkey — ciò che `tauri signer generate` scrive nel file
 * .pub e che va incollata in plugins.updater.pubkey (M0.6.4):
 *   UNA sola riga base64 standard (charset A–Z a–z 0–9 + /, padding "="
 *   corretto, nessuno spazio né newline; 152 caratteri) che decodifica in
 *   UTF-8 nel file minisign a due righe:
 *     riga 1: "untrusted comment: minisign public key: " + KEYID, con KEYID
 *             esadecimale MAIUSCOLO di 16 caratteri (riga di 56 caratteri);
 *     riga 2: "RW" + 54 caratteri base64, 56 caratteri in tutto (base64 dei
 *             42 byte: "Ed" + keyid 8 byte + chiave Ed25519 32 byte);
 *     al più un newline finale, nessuna terza riga.
 *   Il blob base64 inizia per "dW50cnVzdGVkIGNvbW1lbnQ6" (base64 di
 *   "untrusted comment:").
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

const MINISIGN_COMMENT_PREFIX = "untrusted comment: minisign public key: ";
const MINISIGN_KEYID_RE = /^[0-9A-F]{16}$/;
const MINISIGN_KEY_LINE_RE = /^RW[A-Za-z0-9+/]{54}$/;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const PUBKEY_PLACEHOLDER_SUBSTRING = "REPLACE_WITH";

/**
 * Valida una pubkey contro il contratto minisign di Tauri (vedi intestazione).
 * Ritorna null se la pubkey è valida, altrimenti la descrizione esplicita
 * della prima violazione trovata: base64 / riga di commento / riga chiave.
 */
export function minisignPubkeyProblem(pubkey) {
  if (typeof pubkey !== "string" || pubkey.length === 0) {
    return "pubkey assente o vuota";
  }
  if (pubkey.includes(PUBKEY_PLACEHOLDER_SUBSTRING)) {
    return (
      "segnaposto non ancora sostituito — sostituisci il segnaposto con la " +
      "pubkey minisign reale del maintainer: la riga base64 del file .pub " +
      'prodotto da "tauri signer generate"'
    );
  }
  if (!BASE64_RE.test(pubkey) || pubkey.length % 4 !== 0) {
    return (
      "non è base64 valido: attesa UNA sola riga con charset A–Z a–z 0–9 + / " +
      'e padding "=" corretto, nessuno spazio né newline'
    );
  }
  const decoded = Buffer.from(pubkey, "base64").toString("utf8");
  const firstNewline = decoded.indexOf("\n");
  const commentLine = firstNewline === -1 ? decoded : decoded.slice(0, firstNewline);
  if (!commentLine.startsWith(MINISIGN_COMMENT_PREFIX)) {
    return (
      "la chiave decodificata non inizia con la riga di commento minisign " +
      '"untrusted comment: minisign public key: <ID esadecimale>"'
    );
  }
  const keyId = commentLine.slice(MINISIGN_COMMENT_PREFIX.length);
  if (!MINISIGN_KEYID_RE.test(keyId)) {
    return (
      "l'ID nella riga di commento deve essere di 16 caratteri esadecimali " +
      `MAIUSCOLI, trovato ${JSON.stringify(keyId)}`
    );
  }
  const rest = firstNewline === -1 ? "" : decoded.slice(firstNewline + 1);
  const keyLine = rest.endsWith("\n") ? rest.slice(0, -1) : rest;
  if (keyLine.length === 0) {
    return 'manca la riga della chiave (seconda riga "RW…" del file .pub)';
  }
  if (keyLine.includes("\n")) {
    return "ci sono righe aggiuntive dopo la riga della chiave (ammesso al più un newline finale)";
  }
  if (!MINISIGN_KEY_LINE_RE.test(keyLine)) {
    return 'la riga della chiave deve essere "RW" + 54 caratteri base64 (56 caratteri in tutto)';
  }
  return null;
}

/** true se la pubkey rispetta il contratto minisign di Tauri. */
export function isValidMinisignPubkey(pubkey) {
  return minisignPubkeyProblem(pubkey) === null;
}

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
  const pubkeyProblem = minisignPubkeyProblem(conf?.plugins?.updater?.pubkey);
  if (pubkeyProblem !== null) {
    problems.push(`plugins.updater.pubkey non è una pubkey minisign valida: ${pubkeyProblem}`);
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

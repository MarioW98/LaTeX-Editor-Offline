#!/usr/bin/env node
/**
 * B0.5.1 — Versione a fonte singola.
 *
 * L'unica fonte di verità della versione dell'app è il campo "version" di
 * src-tauri/tauri.conf.json. Questo script la propaga, senza toccare null'altro,
 * sui file che la devono semplicemente rispecchiare:
 *
 *   - package.json        (radice)
 *   - package-lock.json   (le DUE versioni della radice: top-level e packages[""])
 *   - src-tauri/Cargo.toml (solo la sezione [package])
 *   - src-tauri/Cargo.lock (solo il blocco [[package]] latex-editor-offline)
 *
 * Uso:
 *   node scripts/sync-version.mjs           aggiorna i file derivati
 *   node scripts/sync-version.mjs --check   non scrive nulla, esce con 1 se i
 *                                           file divergono da tauri.conf.json
 *
 * Dopo un bump di versione in tauri.conf.json eseguire lo script e committare
 * tutto insieme: la CI verifica la coerenza e fallisce se i file divergono.
 * Nessuna dipendenza oltre a Node (>= 22), solo moduli standard.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Semver semplice ma rigoroso (major.minor.patch + pre-release/build opzionali). */
export const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * Estrae e valida la versione dell'app da src-tauri/tauri.conf.json.
 * Lancia un errore esplicito se il campo manca o non è semver: mai proseguire
 * con una versione ambigua.
 */
export function extractAppVersion(tauriConfJson) {
  let conf;
  try {
    conf = JSON.parse(tauriConfJson);
  } catch (e) {
    throw new Error(`tauri.conf.json non è JSON valido: ${e.message}`);
  }
  const v = conf?.version;
  if (typeof v !== "string" || !SEMVER_RE.test(v)) {
    throw new Error(`tauri.conf.json: campo "version" assente o non semver (${JSON.stringify(v)})`);
  }
  return v;
}

/** Sostituisce la PRIMA riga `"version": "…"` di un testo JSON. */
function replaceFirstVersionJsonLine(text, version) {
  const re = /^(\s*)"version":\s*"[^"]*"(,?)$/m;
  if (!re.test(text)) {
    throw new Error('nessuna riga "version": "…" trovata');
  }
  return text.replace(re, `$1"version": "${version}"$2`);
}

/** package.json: una sola riga "version", quella della radice. */
export function syncPackageJsonText(text, version) {
  return replaceFirstVersionJsonLine(text, version);
}

/**
 * package-lock.json: SOLO le due versioni della radice (top-level e blocco
 * packages[""]). Le versioni delle dipendenze — anche quelle che per caso
 * valgono come la vecchia versione dell'app — non devono essere toccate.
 */
export function syncPackageLockText(text, version) {
  let out = replaceFirstVersionJsonLine(text, version);
  const marker = /^\s*"":\s*\{$/m;
  const m = marker.exec(out);
  if (!m) {
    throw new Error('package-lock.json: blocco packages[""] non trovato');
  }
  const splitAt = m.index + m[0].length;
  const head = out.slice(0, splitAt);
  const tail = out.slice(splitAt);
  return head + replaceFirstVersionJsonLine(tail, version);
}

/**
 * src-tauri/Cargo.toml: SOLO il campo version della sezione [package]. Le
 * dipendenze hanno i loro "version = …" dentro [dependencies]/[dev-dependencies]
 * e non c'entrano con la versione dell'app.
 */
export function syncCargoTomlText(text, version) {
  const pkgStart = text.indexOf("[package]");
  if (pkgStart === -1) {
    throw new Error("sezione [package] non trovata");
  }
  const nextSection = text.indexOf("\n[", pkgStart + 1);
  const sectionEnd = nextSection === -1 ? text.length : nextSection;
  const head = text.slice(0, sectionEnd);
  const tail = text.slice(sectionEnd);
  const re = /^version(\s*)=\s*"[^"]*"$/m;
  if (!re.test(head)) {
    throw new Error('Cargo.toml: manca "version = …" nella sezione [package]');
  }
  return head.replace(re, `version$1= "${version}"`) + tail;
}

/**
 * src-tauri/Cargo.lock: SOLO il campo version del blocco [[package]] di
 * latex-editor-offline. Ogni altra crate nel lock ha la propria versione.
 */
export function syncCargoLockText(text, version, packageName = "latex-editor-offline") {
  const re = new RegExp(
    `(\\[\\[package\\]\\]\nname = ${JSON.stringify(packageName)}\nversion = )"[^"]*"`,
  );
  if (!re.test(text)) {
    throw new Error(`Cargo.lock: blocco [[package]] ${packageName} non trovato`);
  }
  return text.replace(re, `$1"${version}"`);
}

/** I file che devono rispecchiare la versione di tauri.conf.json. */
const DERIVED_FILES = [
  { rel: "package.json", sync: syncPackageJsonText },
  { rel: "package-lock.json", sync: syncPackageLockText },
  { rel: "src-tauri/Cargo.toml", sync: syncCargoTomlText },
  { rel: "src-tauri/Cargo.lock", sync: syncCargoLockText },
];

/**
 * Confronta i file derivati con la versione di tauri.conf.json.
 * Ritorna { version, changes } dove changes elenca i file fuori sync.
 * Non scrive nulla.
 */
export function computeSyncPlan(root) {
  const version = extractAppVersion(
    readFileSync(path.join(root, "src-tauri/tauri.conf.json"), "utf8"),
  );
  const changes = [];
  for (const f of DERIVED_FILES) {
    const p = path.join(root, f.rel);
    let original;
    try {
      original = readFileSync(p, "utf8");
    } catch (e) {
      throw new Error(`${f.rel}: non leggibile (${e.message})`);
    }
    let synced;
    try {
      synced = f.sync(original, version);
    } catch (e) {
      throw new Error(`${f.rel}: ${e.message}`);
    }
    if (synced !== original) {
      changes.push({ rel: f.rel, path: p, synced });
    }
  }
  return { version, changes };
}

export function main(argv) {
  const check = argv.includes("--check");
  const { version, changes } = computeSyncPlan(REPO_ROOT);
  if (check) {
    if (changes.length > 0) {
      console.error(
        `I file della versione divergono da src-tauri/tauri.conf.json (versione ${version}):`,
      );
      for (const c of changes) console.error(`  - ${c.rel}`);
      console.error("Esegui 'node scripts/sync-version.mjs' e committa il risultato.");
      process.exit(1);
    }
    console.log(
      `OK: versione ${version} coerente in tauri.conf.json, package.json, package-lock.json, Cargo.toml e Cargo.lock.`,
    );
    return;
  }
  for (const c of changes) {
    writeFileSync(c.path, c.synced);
    console.log(`aggiornato ${c.rel} -> ${version}`);
  }
  if (changes.length === 0) {
    console.log(`nessuna modifica necessaria: tutto già alla versione ${version}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}

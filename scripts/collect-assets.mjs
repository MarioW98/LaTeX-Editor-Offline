#!/usr/bin/env node
/**
 * MU.2b — raccolta degli artifact del job release con nomi stabili.
 *
 * Porta in Node la logica del passo «Collect installer files (stable
 * names)» di .github/workflows/build.yml: copia da dist/ a assets/ con
 * nomi senza numero di versione (README e manuale li linkano direttamente),
 * elenco «Files to publish:» e, sui tag v*, completezza degli asset updater.
 *
 * tauri v2 nomina l'artifact updater macOS SENZA architettura
 * (<productName>.app.tar.gz, doc ufficiale). La matrice CI compila macOS
 * SOLO su Apple Silicon (macos-latest): un .app.tar.gz senza architettura
 * nel nome proviene da quel job.
 *
 * Uso (job release, dopo il download degli artifact):
 *   node scripts/collect-assets.mjs --dist dist --assets assets --ref "$GITHUB_REF"
 *
 * --ref refs/tags/v* attiva la modalità «rilascio versionato»: vengono
 * copiati anche gli artifact updater firmati (.sig e .app.tar.gz) e la
 * completezza dei file richiesti è verificata. Nessuna dipendenza
 * (Node >= 22).
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { UPDATER_PLATFORMS } from "./make-latest.mjs";

const STABLE_PREFIX = "LaTeX-Editor-Offline";

/** I 6 file richiesti nel rilascio versionato: asset e firma per piattaforma updater. */
export const REQUIRED_TAG_ASSETS = Object.values(UPDATER_PLATFORMS).flatMap((spec) => [
  spec.asset,
  spec.signatureFile,
]);

/** Nome stabile per un nome file di output tauri; null se non è un artifact raccolto. */
export function stableName(fileName) {
  if (fileName.endsWith(".msi.sig")) return `${STABLE_PREFIX}-windows-x64.msi.sig`;
  if (fileName.endsWith(".msi")) return `${STABLE_PREFIX}-windows-x64.msi`;
  if (fileName.endsWith(".deb")) return `${STABLE_PREFIX}-linux-amd64.deb`;
  if (fileName.endsWith(".AppImage.sig")) return `${STABLE_PREFIX}-linux-amd64.AppImage.sig`;
  if (fileName.endsWith(".AppImage")) return `${STABLE_PREFIX}-linux-amd64.AppImage`;
  if (fileName.endsWith(".dmg")) {
    if (fileName.includes("aarch64")) return `${STABLE_PREFIX}-macos-aarch64.dmg`;
    if (fileName.includes("x86_64")) return `${STABLE_PREFIX}-macos-x64.dmg`;
    return `${STABLE_PREFIX}-macos.dmg`;
  }
  if (fileName.endsWith(".app.tar.gz.sig")) {
    return `${STABLE_PREFIX}-macos-${updaterArch(fileName)}.app.tar.gz.sig`;
  }
  if (fileName.endsWith(".app.tar.gz")) {
    return `${STABLE_PREFIX}-macos-${updaterArch(fileName)}.app.tar.gz`;
  }
  return null;
}

/**
 * Architettura nel nome stabile dell'artifact updater macOS: aarch64 se il
 * nome la menziona, x64 in caso di x86_64 esplicito. tauri v2 nomina però
 * l'updater macOS SENZA architettura (<productName>.app.tar.gz, doc
 * ufficiale): quel file proviene dal job macos-latest della matrice, che
 * compila macOS SOLO su Apple Silicon, quindi il ramo residuo è aarch64.
 */
function updaterArch(fileName) {
  if (fileName.includes("aarch64")) return "aarch64";
  if (fileName.includes("x86_64")) return "x64";
  return "aarch64";
}

/**
 * Piano di copia {fileSorgente (relativo a dist/) -> nomeStabile}: stessa
 * semantica del bash. Il match è sul nome completo del file; fuori dai
 * tag v* il find raccoglie solo gli installer, non gli artifact updater.
 */
export function planStableNames(files, { tagMode } = {}) {
  const plan = {};
  for (const relPath of [...files].sort()) {
    const base = path.basename(relPath);
    const stable = stableName(base);
    if (stable === null) continue;
    const isUpdaterArtifact = base.endsWith(".sig") || base.endsWith(".app.tar.gz");
    if (!tagMode && isUpdaterArtifact) continue;
    plan[relPath] = stable;
  }
  return plan;
}

/**
 * Completezza della cartella assets/: zero file è sempre un errore; nei
 * tag v* mancano gli artifact updater elencati TUTTI in un unico errore.
 */
export function checkCompleteness(assetDir, { tagMode } = {}) {
  const files = existsSync(assetDir)
    ? readdirSync(assetDir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort()
    : [];
  if (files.length === 0) {
    throw new Error(`nessun file da pubblicare in ${assetDir}: la raccolta non ha prodotto alcun asset.`);
  }
  if (!tagMode) return files;
  const missing = REQUIRED_TAG_ASSETS.filter((name) => !files.includes(name));
  if (missing.length > 0) {
    throw new Error(
      `Rilascio versionato incompleto:\n  - ${missing
        .map((name) => `Asset updater mancante nel rilascio: ${name}`)
        .join("\n  - ")}`,
    );
  }
  return files;
}

function walkFiles(root, dir = root) {
  if (!existsSync(dir)) {
    throw new Error(`directory ${dir} inesistente: niente da raccogliere.`);
  }
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(root, full));
    else if (entry.isFile()) out.push(path.relative(root, full).split(path.sep).join("/"));
  }
  return out.sort();
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new Error(`argomento inatteso: ${arg}`);
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

export function main(argv) {
  const args = parseArgs(argv);
  for (const key of ["dist", "assets", "ref"]) {
    if (typeof args[key] !== "string") throw new Error(`manca l'argomento --${key}`);
  }
  // Come il test bash [[ "$GITHUB_REF" == refs/tags/v* ]]: match sul prefisso.
  const tagMode = args.ref.startsWith("refs/tags/v");
  const plan = planStableNames(walkFiles(args.dist), { tagMode });
  mkdirSync(args.assets, { recursive: true });
  const byStable = new Map();
  for (const [src, stable] of Object.entries(plan)) {
    const already = byStable.get(stable);
    if (already !== undefined) {
      throw new Error(
        `due file sorgente («${already}», «${src}») finirebbero sullo stesso nome stabile («${stable}»): la copia non sarebbe deterministica.`,
      );
    }
    byStable.set(stable, src);
    copyFileSync(path.join(args.dist, src), path.join(args.assets, stable));
  }
  console.log("Files to publish:");
  for (const stable of Object.values(plan).sort()) console.log(`  ${stable}`);
  try {
    checkCompleteness(args.assets, { tagMode });
  } catch (err) {
    console.error(`::error::${err.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}

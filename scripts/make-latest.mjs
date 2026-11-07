#!/usr/bin/env node
/**
 * MU.2 — genera e valida latest.json per l'updater (rilasci versionati v*).
 *
 * latest.json è l'indice che l'app scarica SOLO quando l'utente preme
 * «Controlla aggiornamenti»: versione, data, note e, per piattaforma, l'URL
 * dell'artifact del RILASCIO VERSIONATO e la firma (= contenuto del .sig).
 *
 * Uso (nel job release, su tag v*):
 *   node scripts/make-latest.mjs --repo MarioW98/LaTeX-Editor-Offline \
 *     --tag v0.2.0 --assets-dir assets --notes-file tag-notes.txt \
 *     --out assets/latest.json
 *   node scripts/make-latest.mjs --check assets/latest.json
 *
 * Se una piattaforma manca, o una firma manca o è vuota, o il tag non è
 * semver: ERRORE esplicito e uscita non zero. Meglio rosso in CI che un
 * updater che dà errore a casa dell'utente. Nessuna dipendenza (Node >= 22).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** Asset (nomi stabili della release) e file firma per piattaforma. */
export const UPDATER_PLATFORMS = {
  "windows-x86_64": {
    asset: "LaTeX-Editor-Offline-windows-x64.msi",
    signatureFile: "LaTeX-Editor-Offline-windows-x64.msi.sig",
  },
  "linux-x86_64": {
    asset: "LaTeX-Editor-Offline-linux-amd64.AppImage",
    signatureFile: "LaTeX-Editor-Offline-linux-amd64.AppImage.sig",
  },
  "darwin-aarch64": {
    asset: "LaTeX-Editor-Offline-macos-aarch64.app.tar.gz",
    signatureFile: "LaTeX-Editor-Offline-macos-aarch64.app.tar.gz.sig",
  },
};

/** Da "v0.2.0" a "0.2.0"; errore esplicito se il tag non è vX.Y.Z. */
export function parseTagVersion(tag) {
  if (typeof tag !== "string" || !tag.startsWith("v")) {
    throw new Error(`tag non valido (${JSON.stringify(tag)}): deve essere della forma vX.Y.Z`);
  }
  const version = tag.slice(1);
  if (!SEMVER_RE.test(version)) {
    throw new Error(`versione non semver nel tag ${tag}: ${JSON.stringify(version)}`);
  }
  return version;
}

/** URL dell'asset nel rilascio versionato (non dal rolling "latest"). */
export function assetUrl(repo, tag, asset) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new Error(`repo non valido: ${JSON.stringify(repo)} (atteso owner/name)`);
  }
  return `https://github.com/${repo}/releases/download/${tag}/${asset}`;
}

/**
 * Costruisce il manifest leggendo i .sig da assetsDir. Firma assente o vuota
 * per una piattaforma = errore che elenca TUTTI i problemi trovati.
 */
export function buildLatestManifest({ repo, tag, assetsDir, notes, pubDate = new Date() }) {
  const version = parseTagVersion(tag);
  const problems = [];
  const platforms = {};
  for (const [key, spec] of Object.entries(UPDATER_PLATFORMS)) {
    let signature = "";
    try {
      signature = readFileSync(path.join(assetsDir, spec.signatureFile), "utf8").trim();
    } catch {
      problems.push(`piattaforma ${key}: manca la firma ${spec.signatureFile}`);
      continue;
    }
    if (signature === "") {
      problems.push(`piattaforma ${key}: firma VUOTA in ${spec.signatureFile}`);
      continue;
    }
    platforms[key] = { signature, url: assetUrl(repo, tag, spec.asset) };
  }
  if (problems.length > 0) {
    throw new Error(`latest.json incompleto:\n  - ${problems.join("\n  - ")}`);
  }
  return {
    version,
    notes: typeof notes === "string" && notes.trim() !== "" ? notes.trim() : `Rilascio ${tag}`,
    pub_date: pubDate.toISOString(),
    platforms,
  };
}

/** Validazione del manifest: ogni problema è una riga del verbale. */
export function validateLatestManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return ["manifest non è un oggetto"];
  }
  const problems = [];
  if (typeof manifest.version !== "string" || !SEMVER_RE.test(manifest.version)) {
    problems.push(`versione non semver: ${JSON.stringify(manifest.version)}`);
  }
  if (
    typeof manifest.pub_date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(manifest.pub_date)
  ) {
    problems.push(`pub_date non RFC3339: ${JSON.stringify(manifest.pub_date)}`);
  }
  const platforms = manifest.platforms ?? {};
  for (const key of Object.keys(UPDATER_PLATFORMS)) {
    const p = platforms[key];
    if (!p || typeof p !== "object" || Array.isArray(p)) {
      problems.push(`manca la piattaforma ${key}`);
      continue;
    }
    if (typeof p.url !== "string" || p.url === "") problems.push(`${key}: url vuoto`);
    if (typeof p.signature !== "string" || p.signature === "") problems.push(`${key}: signature vuota`);
  }
  const extra = Object.keys(platforms).filter((k) => !(k in UPDATER_PLATFORMS));
  if (extra.length > 0) problems.push(`piattaforme inattese: ${extra.join(", ")}`);
  return problems;
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
  if (args.check) {
    const manifest = JSON.parse(readFileSync(args.check, "utf8"));
    const problems = validateLatestManifest(manifest);
    if (problems.length > 0) {
      console.error(`latest.json NON valido (${args.check}):\n  - ${problems.join("\n  - ")}`);
      process.exit(1);
    }
    console.log(
      `OK: latest.json valido (versione ${manifest.version}, piattaforme: ${Object.keys(manifest.platforms).join(", ")}).`,
    );
    return;
  }
  for (const k of ["repo", "tag", "assets-dir", "out"]) {
    if (typeof args[k] !== "string") throw new Error(`manca l'argomento --${k}`);
  }
  let notes = "";
  if (typeof args["notes-file"] === "string") {
    notes = readFileSync(args["notes-file"], "utf8");
  }
  const manifest = buildLatestManifest({
    repo: args.repo,
    tag: args.tag,
    assetsDir: args["assets-dir"],
    notes,
  });
  const problems = validateLatestManifest(manifest);
  if (problems.length > 0) {
    throw new Error(`manifest appena generato ma non valido (bug interno): ${problems.join("; ")}`);
  }
  writeFileSync(args.out, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `scritto ${args.out} (versione ${manifest.version}, piattaforme: ${Object.keys(manifest.platforms).join(", ")})`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}

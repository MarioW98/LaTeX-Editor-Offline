/**
 * Test discriminante MU.2 — generazione/validazione di latest.json
 * (si esegue con `npm test`, cioè `node --test`).
 *
 * latest.json è l'indice che l'updater scarica su richiesta esplicita
 * dell'utente: se una piattaforma manca, o una firma è assente/vuota,
 * l'aggiornamento fallirebbe a casa dell'utente.
 *
 * Punti di fallimento sulla versione naive (generazione senza validazione):
 *   - "firma linux mancante" non lancia nessun errore: verrebbe pubblicato
 *     un latest.json senza quella piattaforma;
 *   - "firma vuota" passa in silenzio;
 *   - "validateLatestManifest" non segnala né le piattaforme mancanti né le
 *     firme vuote né i tag non semver.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  UPDATER_PLATFORMS,
  assetUrl,
  buildLatestManifest,
  parseTagVersion,
  validateLatestManifest,
} from "./make-latest.mjs";

function makeAssetsDir({ signatures, omit = [], empty = [] } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "make-latest-test-"));
  for (const [key, spec] of Object.entries(UPDATER_PLATFORMS)) {
    if (omit.includes(key)) continue;
    const content = empty.includes(key) ? "   \n" : `${signatures[key]}\n`;
    writeFileSync(path.join(dir, spec.signatureFile), content);
  }
  return dir;
}

test("parseTagVersion: v0.2.0 -> 0.2.0, rifiuta tutto il resto", () => {
  assert.equal(parseTagVersion("v0.2.0"), "0.2.0");
  assert.equal(parseTagVersion("v10.11.12-rc1"), "10.11.12-rc1");
  assert.throws(() => parseTagVersion("0.2.0"), /tag non valido/);
  assert.throws(() => parseTagVersion("main"), /tag non valido/);
  assert.throws(() => parseTagVersion("v0.2"), /semver/);
  assert.throws(() => parseTagVersion("v0.2.x"), /semver/);
});

test("assetUrl: URL dell'artifact nel RILASCIO VERSIONATO, non nel rolling", () => {
  assert.equal(
    assetUrl("MarioW98/LaTeX-Editor-Offline", "v0.2.0", "LaTeX-Editor-Offline-windows-x64.msi"),
    "https://github.com/MarioW98/LaTeX-Editor-Offline/releases/download/v0.2.0/LaTeX-Editor-Offline-windows-x64.msi",
  );
  assert.throws(() => assetUrl("non-un-repo", "v0.2.0", "x.msi"), /repo non valido/);
});

test("buildLatestManifest: tre piattaforme, firme = contenuto dei .sig, url del rilascio versionato", () => {
  const dir = makeAssetsDir({
    signatures: {
      "windows-x86_64": "firma-msi-abc",
      "linux-x86_64": "firma-appimage-def",
      "darwin-aarch64": "firma-macos-ghi",
    },
  });
  try {
    const manifest = buildLatestManifest({
      repo: "MarioW98/LaTeX-Editor-Offline",
      tag: "v0.2.0",
      assetsDir: dir,
      notes: "  Correzioni e nuova voce aggiornamenti.  \n",
      pubDate: new Date("2026-11-07T12:00:00Z"),
    });
    assert.equal(manifest.version, "0.2.0");
    assert.equal(manifest.notes, "Correzioni e nuova voce aggiornamenti.");
    assert.equal(manifest.pub_date, "2026-11-07T12:00:00.000Z");
    assert.deepEqual(Object.keys(manifest.platforms).sort(), [
      "darwin-aarch64",
      "linux-x86_64",
      "windows-x86_64",
    ]);
    assert.equal(manifest.platforms["windows-x86_64"].signature, "firma-msi-abc");
    assert.equal(
      manifest.platforms["linux-x86_64"].url,
      "https://github.com/MarioW98/LaTeX-Editor-Offline/releases/download/v0.2.0/LaTeX-Editor-Offline-linux-amd64.AppImage",
    );
    // Il manifest generato è già valido.
    assert.deepEqual(validateLatestManifest(manifest), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("buildLatestManifest: firma linux mancante -> errore esplicito (meglio rosso)", () => {
  const dir = makeAssetsDir({
    signatures: { "windows-x86_64": "a", "linux-x86_64": "b", "darwin-aarch64": "c" },
    omit: ["linux-x86_64"],
  });
  try {
    assert.throws(
      () => buildLatestManifest({ repo: "MarioW98/LaTeX-Editor-Offline", tag: "v0.2.0", assetsDir: dir }),
      /piattaforma linux-x86_64: manca la firma/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("buildLatestManifest: firma vuota -> errore esplicito", () => {
  const dir = makeAssetsDir({
    signatures: { "windows-x86_64": "a", "linux-x86_64": "b", "darwin-aarch64": "c" },
    empty: ["darwin-aarch64"],
  });
  try {
    assert.throws(
      () => buildLatestManifest({ repo: "MarioW98/LaTeX-Editor-Offline", tag: "v0.2.0", assetsDir: dir }),
      /piattaforma darwin-aarch64: firma VUOTA/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("buildLatestManifest: note vuote -> titolo di default col tag", () => {
  const dir = makeAssetsDir({
    signatures: { "windows-x86_64": "a", "linux-x86_64": "b", "darwin-aarch64": "c" },
  });
  try {
    const manifest = buildLatestManifest({
      repo: "MarioW98/LaTeX-Editor-Offline",
      tag: "v0.2.1",
      assetsDir: dir,
      notes: "   \n",
    });
    assert.equal(manifest.notes, "Rilascio v0.2.1");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("validateLatestManifest: segnala piattaforma mancante, firma vuota, versione non semver", () => {
  const ok = {
    version: "0.2.0",
    notes: "x",
    pub_date: "2026-11-07T12:00:00Z",
    platforms: {
      "windows-x86_64": { signature: "s", url: "https://github.com/o/r/releases/download/v0.2.0/a.msi" },
      "linux-x86_64": { signature: "s", url: "https://github.com/o/r/releases/download/v0.2.0/b.AppImage" },
      "darwin-aarch64": { signature: "s", url: "https://github.com/o/r/releases/download/v0.2.0/c.app.tar.gz" },
    },
  };
  assert.deepEqual(validateLatestManifest(ok), []);

  const missing = structuredClone(ok);
  delete missing.platforms["linux-x86_64"];
  assert.ok(validateLatestManifest(missing).some((p) => p.includes("manca la piattaforma linux-x86_64")));

  const emptySig = structuredClone(ok);
  emptySig.platforms["windows-x86_64"].signature = "";
  assert.ok(validateLatestManifest(emptySig).some((p) => p.includes("windows-x86_64: signature vuota")));

  const badVersion = structuredClone(ok);
  badVersion.version = "0.2";
  assert.ok(validateLatestManifest(badVersion).some((p) => p.includes("versione non semver")));

  const badDate = structuredClone(ok);
  badDate.pub_date = "07/11/2026";
  assert.ok(validateLatestManifest(badDate).some((p) => p.includes("pub_date non RFC3339")));

  const extra = structuredClone(ok);
  extra.platforms["solaris-sparc"] = { signature: "s", url: "u" };
  assert.ok(validateLatestManifest(extra).some((p) => p.includes("piattaforme inattese")));
});

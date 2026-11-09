/**
 * Test discriminante MU.2b — raccolta degli installer con nomi stabili
 * (si esegue con `npm test`, cioè `node --test`).
 *
 * Il passo bash «Collect installer files (stable names)» rinominava gli
 * artifact updater macOS con un case su aarch64 / x86_64 / ramo
 * predefinito: il ramo predefinito produceva
 * «LaTeX-Editor-Offline-macos.app.tar.gz», nome che il check di
 * completezza e UPDATER_PLATFORMS (chiave darwin-aarch64) non riconoscono,
 * quindi il rilascio versionato falliva («Asset updater mancante»).
 *
 * Punti di fallimento sulla versione naive (ramo * portato identico):
 *   - planStableNames mappa «LaTeX Editor Offline.app.tar.gz» (tauri v2
 *     nomina l'updater macOS SENZA architettura) su «-macos.app.tar.gz»
 *     invece di «-macos-aarch64.app.tar.gz», e idem il .sig;
 *   - di conseguenza la CLI in tagMode esce 1 per completezza mancata.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REQUIRED_TAG_ASSETS,
  checkCompleteness,
  planStableNames,
} from "./collect-assets.mjs";

const SCRIPT = fileURLToPath(new URL("./collect-assets.mjs", import.meta.url));

/**
 * Nomi REALISTICI dell'output di tauri v2, disposti come i sotto-directory
 * dell'artifact dopo il download con merge-multiple (msi/, deb/, appimage/,
 * dmg/, macos/). L'artifact updater macOS è «<productName>.app.tar.gz»
 * SENZA versione e SENZA architettura (doc ufficiale tauri v2); l'updater
 * su Windows/Linux firma anche .msi e .AppImage, il .deb non ha firma.
 * I file portatili arrivano in dist/ da artifact separati: nessuno dei
 * loro nomi è un installer, non devono finire in assets/.
 */
const FIXTURES = [
  ["", "latex-editor-offline.exe"],
  ["", "latex-editor-offline"],
  ["", "LaTeX-Editor-Offline-macos-portable.zip"],
  ["msi", "LaTeX Editor Offline_0.2.0_x64_en-US.msi"],
  ["msi", "LaTeX Editor Offline_0.2.0_x64_en-US.msi.sig"],
  ["deb", "LaTeX Editor Offline_0.2.0_amd64.deb"],
  ["appimage", "LaTeX Editor Offline_0.2.0_amd64.AppImage"],
  ["appimage", "LaTeX Editor Offline_0.2.0_amd64.AppImage.sig"],
  ["dmg", "LaTeX Editor Offline_0.2.0_aarch64.dmg"],
  ["macos", "LaTeX Editor Offline.app.tar.gz"],
  ["macos", "LaTeX Editor Offline.app.tar.gz.sig"],
];

function makeDist() {
  const dist = mkdtempSync(path.join(tmpdir(), "collect-assets-dist-"));
  for (const [sub, name] of FIXTURES) {
    mkdirSync(path.join(dist, sub), { recursive: true });
    writeFileSync(path.join(dist, sub, name), `${name}\n`);
  }
  return dist;
}

const FIXTURE_PATHS = FIXTURES.map(([sub, name]) => (sub === "" ? name : `${sub}/${name}`));

test("planStableNames (tagMode): mappa completa, .app.tar.gz di tauri v2 senza arch -> macos-aarch64", () => {
  const plan = planStableNames(FIXTURE_PATHS, { tagMode: true });
  assert.deepEqual(plan, {
    "msi/LaTeX Editor Offline_0.2.0_x64_en-US.msi": "LaTeX-Editor-Offline-windows-x64.msi",
    "msi/LaTeX Editor Offline_0.2.0_x64_en-US.msi.sig": "LaTeX-Editor-Offline-windows-x64.msi.sig",
    "deb/LaTeX Editor Offline_0.2.0_amd64.deb": "LaTeX-Editor-Offline-linux-amd64.deb",
    "appimage/LaTeX Editor Offline_0.2.0_amd64.AppImage": "LaTeX-Editor-Offline-linux-amd64.AppImage",
    "appimage/LaTeX Editor Offline_0.2.0_amd64.AppImage.sig": "LaTeX-Editor-Offline-linux-amd64.AppImage.sig",
    "dmg/LaTeX Editor Offline_0.2.0_aarch64.dmg": "LaTeX-Editor-Offline-macos-aarch64.dmg",
    "macos/LaTeX Editor Offline.app.tar.gz": "LaTeX-Editor-Offline-macos-aarch64.app.tar.gz",
    "macos/LaTeX Editor Offline.app.tar.gz.sig": "LaTeX-Editor-Offline-macos-aarch64.app.tar.gz.sig",
  });
});

test("planStableNames: *.app.tar.gz non cattura mai i .sig, e i .sig mantengono il suffisso", () => {
  const plan = planStableNames(
    ["LaTeX Editor Offline.app.tar.gz", "LaTeX Editor Offline.app.tar.gz.sig"],
    { tagMode: true },
  );
  assert.deepEqual(plan, {
    "LaTeX Editor Offline.app.tar.gz": "LaTeX-Editor-Offline-macos-aarch64.app.tar.gz",
    "LaTeX Editor Offline.app.tar.gz.sig": "LaTeX-Editor-Offline-macos-aarch64.app.tar.gz.sig",
  });
  assert.ok(!plan["LaTeX Editor Offline.app.tar.gz"].endsWith(".sig"));
});

test("planStableNames: semantica identica al bash per msi/deb/AppImage/dmg e firme", () => {
  const plan = planStableNames(
    [
      "App_0.1.0_x64_en-US.msi",
      "App_0.1.0_x64_en-US.msi.sig",
      "App_0.1.0_amd64.deb",
      "App_0.1.0_amd64.AppImage",
      "App_0.1.0_amd64.AppImage.sig",
      "App_0.1.0_x86_64.dmg",
      "App_0.1.0_aarch64.dmg",
      "App_0.1.0.dmg",
    ],
    { tagMode: true },
  );
  assert.deepEqual(plan, {
    "App_0.1.0_x64_en-US.msi": "LaTeX-Editor-Offline-windows-x64.msi",
    "App_0.1.0_x64_en-US.msi.sig": "LaTeX-Editor-Offline-windows-x64.msi.sig",
    "App_0.1.0_amd64.deb": "LaTeX-Editor-Offline-linux-amd64.deb",
    "App_0.1.0_amd64.AppImage": "LaTeX-Editor-Offline-linux-amd64.AppImage",
    "App_0.1.0_amd64.AppImage.sig": "LaTeX-Editor-Offline-linux-amd64.AppImage.sig",
    "App_0.1.0_x86_64.dmg": "LaTeX-Editor-Offline-macos-x64.dmg",
    "App_0.1.0_aarch64.dmg": "LaTeX-Editor-Offline-macos-aarch64.dmg",
    "App_0.1.0.dmg": "LaTeX-Editor-Offline-macos.dmg",
  });
});

test("planStableNames (fuori tagMode): solo installer, artifact updater esclusi come il find bash", () => {
  const plan = planStableNames(FIXTURE_PATHS, { tagMode: false });
  assert.deepEqual(plan, {
    "msi/LaTeX Editor Offline_0.2.0_x64_en-US.msi": "LaTeX-Editor-Offline-windows-x64.msi",
    "deb/LaTeX Editor Offline_0.2.0_amd64.deb": "LaTeX-Editor-Offline-linux-amd64.deb",
    "appimage/LaTeX Editor Offline_0.2.0_amd64.AppImage": "LaTeX-Editor-Offline-linux-amd64.AppImage",
    "dmg/LaTeX Editor Offline_0.2.0_aarch64.dmg": "LaTeX-Editor-Offline-macos-aarch64.dmg",
  });
});

test("planStableNames: i file estranei (binario portatile, zip, latest.json) non entrano nel piano", () => {
  const plan = planStableNames(
    ["latex-editor-offline.exe", "LaTeX-Editor-Offline-macos-portable.zip", "latest.json", "tag-notes.txt"],
    { tagMode: true },
  );
  assert.deepEqual(plan, {});
});

test("checkCompleteness (tagMode): verde con i 6 file richiesti, errore UNICO che elenca TUTTI i mancanti", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "collect-assets-check-"));
  try {
    for (const name of REQUIRED_TAG_ASSETS) {
      writeFileSync(path.join(dir, name), `${name}\n`);
    }
    assert.deepEqual(checkCompleteness(dir, { tagMode: true }), [...REQUIRED_TAG_ASSETS].sort());

    rmSync(path.join(dir, "LaTeX-Editor-Offline-windows-x64.msi.sig"));
    rmSync(path.join(dir, "LaTeX-Editor-Offline-macos-aarch64.app.tar.gz"));
    assert.throws(
      () => checkCompleteness(dir, { tagMode: true }),
      (err) => {
        const message = String(err.message);
        return (
          message.includes("Asset updater mancante nel rilascio: LaTeX-Editor-Offline-windows-x64.msi.sig") &&
          message.includes("Asset updater mancante nel rilascio: LaTeX-Editor-Offline-macos-aarch64.app.tar.gz")
        );
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("checkCompleteness (fuori tagMode): nessun requisito updater, ma zero file resta un errore", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "collect-assets-check2-"));
  try {
    writeFileSync(path.join(dir, "LaTeX-Editor-Offline-windows-x64.msi"), "msi\n");
    assert.deepEqual(checkCompleteness(dir, { tagMode: false }), [
      "LaTeX-Editor-Offline-windows-x64.msi",
    ]);
    assert.throws(() => checkCompleteness(path.join(dir, "vuota"), { tagMode: false }), /nessun file/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function runCli(dist, assets, ref) {
  return spawnSync(
    process.execPath,
    [SCRIPT, "--dist", dist, "--assets", assets, "--ref", ref],
    { encoding: "utf8" },
  );
}

test("CLI (tagMode): copia con nomi stabili, «Files to publish:» e checkCompleteness verde", () => {
  const dist = makeDist();
  const out = mkdtempSync(path.join(tmpdir(), "collect-assets-out-"));
  const assets = path.join(out, "assets");
  try {
    const res = runCli(dist, assets, "refs/tags/v0.2.0");
    assert.equal(
      res.status,
      0,
      `exit ${res.status}\nstdout:\n${res.stdout}\nstderr:\n${res.stderr}`,
    );
    assert.ok(res.stdout.includes("Files to publish:"));
    assert.ok(res.stdout.includes("LaTeX-Editor-Offline-macos-aarch64.app.tar.gz"));
    assert.deepEqual(readdirSync(assets).sort(), [
      "LaTeX-Editor-Offline-windows-x64.msi",
      "LaTeX-Editor-Offline-windows-x64.msi.sig",
      "LaTeX-Editor-Offline-linux-amd64.deb",
      "LaTeX-Editor-Offline-linux-amd64.AppImage",
      "LaTeX-Editor-Offline-linux-amd64.AppImage.sig",
      "LaTeX-Editor-Offline-macos-aarch64.dmg",
      "LaTeX-Editor-Offline-macos-aarch64.app.tar.gz",
      "LaTeX-Editor-Offline-macos-aarch64.app.tar.gz.sig",
    ].sort());
  } finally {
    rmSync(dist, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});

test("CLI (fuori tagMode): gli artifact updater NON vengono copiati in assets/", () => {
  const dist = makeDist();
  const out = mkdtempSync(path.join(tmpdir(), "collect-assets-out2-"));
  const assets = path.join(out, "assets");
  try {
    const res = runCli(dist, assets, "refs/heads/main");
    assert.equal(
      res.status,
      0,
      `exit ${res.status}\nstdout:\n${res.stdout}\nstderr:\n${res.stderr}`,
    );
    assert.deepEqual(readdirSync(assets).sort(), [
      "LaTeX-Editor-Offline-linux-amd64.AppImage",
      "LaTeX-Editor-Offline-linux-amd64.deb",
      "LaTeX-Editor-Offline-macos-aarch64.dmg",
      "LaTeX-Editor-Offline-windows-x64.msi",
    ]);
    assert.ok(!res.stdout.includes(".sig"));
    assert.ok(!res.stdout.includes(".app.tar.gz"));
  } finally {
    rmSync(dist, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});

test("CLI (tagMode incompleto): ::error:: con l'asset mancante, exit 1", () => {
  const dist = makeDist();
  rmSync(path.join(dist, "macos", "LaTeX Editor Offline.app.tar.gz.sig"));
  const out = mkdtempSync(path.join(tmpdir(), "collect-assets-out3-"));
  const assets = path.join(out, "assets");
  try {
    const res = runCli(dist, assets, "refs/tags/v0.2.0");
    assert.equal(res.status, 1);
    const output = `${res.stdout}\n${res.stderr}`;
    assert.ok(output.includes("::error::"));
    assert.ok(
      output.includes(
        "Asset updater mancante nel rilascio: LaTeX-Editor-Offline-macos-aarch64.app.tar.gz.sig",
      ),
    );
  } finally {
    rmSync(dist, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});

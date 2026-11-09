/**
 * M1 — Hook di caricamento moduli per i test node dell'editor.
 *
 * Il runner dei test è `node --test --experimental-strip-types`, che esegue
 * i .ts nativi ma NON i .tsx (il JSX non è sintassi erasabile). Questo hook,
 * registrato dal test PRIMA degli import dinamici dei componenti, traduce
 * gli .tsx con esbuild — già presente nell'albero delle dipendenze di vite,
 * nessuna dipendenza nuova — e stubba gli import dei .css: i CSS module
 * riguardano la build di vite, non la logica testata.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

export async function load(url, context, nextLoad) {
  if (url.endsWith(".css")) {
    return {
      format: "module",
      shortCircuit: true,
      // Stub dei CSS module: ogni classe è la stringa vuota (le classi vere
      // riguardano la build di vite, non la logica testata). I simboli di
      // conversione restano undefined così l'interpolazione usa toString.
      source:
        "export default new Proxy({}, { get: (_t, p) => (typeof p === 'string' ? '' : undefined) });",
    };
  }
  if (url.endsWith(".tsx")) {
    const sorgente = await readFile(fileURLToPath(url), "utf8");
    const compilato = esbuild.transformSync(sorgente, {
      loader: "tsx",
      format: "esm",
      jsx: "automatic",
      target: "es2022",
    });
    return { format: "module", shortCircuit: true, source: compilato.code };
  }
  return nextLoad(url, context);
}

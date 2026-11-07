/**
 * Adapter dell'updater — MU.3.
 *
 * QUESTO è l'unico file dell'app che importa i plugin ufficiali di Tauri
 * (@tauri-apps/plugin-updater e @tauri-apps/plugin-process): tutto il resto
 * (store, componenti) dipende dalla porta `UpdaterPort` definita qui, così i
 * test possono sostituire l'adapter con uno finto tramite
 * `useStore.setState({ updaterPort: fake })` — stessa tecnica degli store
 * test esistenti.
 *
 * INVARIANTE DI RETE: in questo file NON c'è nessun controllo automatico.
 * `check()` viene invocato solo ed esclusivamente quando l'utente preme
 * «Controlla aggiornamenti»: mai all'avvio, mai in background.
 */
import { check as pluginCheck } from "@tauri-apps/plugin-updater";
import { relaunch as pluginRelaunch } from "@tauri-apps/plugin-process";

/** Progresso dello scaricamento in byte (`total` null se non noto). */
export interface DownloadProgress {
  received: number;
  total: number | null;
}

/** Un aggiornamento disponibile, pronto per download e installazione. */
export interface CheckedUpdate {
  version: string;
  currentVersion: string;
  notes: string | null;
  download: (onProgress: (progress: DownloadProgress) => void) => Promise<void>;
  install: () => Promise<void>;
}

/** Porta verso l'updater: l'unica dipendenza del resto dell'app. */
export interface UpdaterPort {
  /** null = nessun aggiornamento; rilancia in caso di errore di rete. */
  check: () => Promise<CheckedUpdate | null>;
  relaunch: () => Promise<void>;
}

/** Messaggio leggibile da un errore qualunque (mai `[object Object]`). */
export function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/**
 * Adapter reale, sopra i plugin JS di Tauri.
 *
 * Su Windows l'installazione chiude l'app (limitazione degli installer
 * MSI): `install()` potrebbe non ritornare. Per questo lo store salva TUTTI
 * i buffer sporchi PRIMA di chiamare install() — chi chiama non deve
 * preoccuparsene.
 */
export const realUpdaterPort: UpdaterPort = {
  check: async () => {
    const update = await pluginCheck();
    if (!update) return null;
    return {
      version: update.version,
      currentVersion: update.currentVersion,
      notes:
        typeof update.body === "string" && update.body.trim() !== "" ? update.body : null,
      download: (onProgress) => {
        // Il plugin emette chunk per chunk: l'adapter accumula i byte
        // ricevuti, così chi ascolta vede sempre un progresso assoluto.
        let received = 0;
        let total: number | null = null;
        return update.download((event) => {
          if (event.event === "Started" && typeof event.data.contentLength === "number") {
            total = event.data.contentLength;
          } else if (event.event === "Progress") {
            received += event.data.chunkLength;
          }
          onProgress({ received, total });
        });
      },
      install: () => update.install(),
    };
  },
  relaunch: async () => {
    await pluginRelaunch();
  },
};

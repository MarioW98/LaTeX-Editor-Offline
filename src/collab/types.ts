/**
 * Predisposizione FUTURA per la collaborazione (fase 2+).
 *
 * QUESTA FASE: nessuna implementazione remota. Le interfacce qui sotto sono
 * solo extension point architetturali; il modello dati resta basato su file
 * normali (cartelle progetto + `.latex-editor/project.json`), senza formati
 * proprietari chiusi, così una futura sincronizzazione non richiederà
 * riscritture pesanti.
 *
 * Regole per chi implementerà la fase 2:
 * - i provider vanno registrati in un registro dedicato (es. `collab/index.ts`);
 * - la UI non deve mai chiamare la rete direttamente: passa sempre da questi
 *   contratti;
 * - filesystem, editor engine e build engine restano disaccoppiati dalla
 *   collaborazione (nessun import inverso).
 */

import type { UnlistenFn } from '@tauri-apps/api/event';

/** Utente locale o (in futuro) remoto. */
export interface CollabUser {
  id: string;
  displayName: string;
}

/** Stato di connessione del provider. */
export type CollabConnectionState = 'offline' | 'connecting' | 'online' | 'error';

/** Contratto per un provider di collaborazione generico. */
export interface CollaborationProvider {
  readonly id: string;
  /** Avvia il provider (per ora: no-op locale). */
  start(): Promise<void>;
  /** Ferma il provider e rilascia le risorse. */
  stop(): Promise<void>;
  readonly state: CollabConnectionState;
  onStateChange(cb: (state: CollabConnectionState) => void): UnlistenFn;
}

/** Presenza: chi sta modificando cosa (cursori condivisi, fase futura). */
export interface PresenceProvider {
  readonly localUser: CollabUser;
  setLocalUser(user: CollabUser): void;
  onPresence(cb: (users: CollabUser[]) => void): UnlistenFn;
}

/** Sincronizzazione di un singolo documento (es. CRDT/OT, fase futura). */
export interface DocumentSyncProvider {
  /** Applica una modifica locale e la propaga (quando attivo). */
  submitLocalChange(path: string, content: string): void;
  onRemoteChange(cb: (path: string, content: string) => void): UnlistenFn;
}

/** Sincronizzazione dell'intero progetto (file tree, fase futura). */
export interface ProjectSyncProvider {
  readonly root: string | null;
  attachProject(root: string): Promise<void>;
  detachProject(): Promise<void>;
  onProjectFilesChanged(cb: () => void): UnlistenFn;
}

/** Marker per indicare che nessun provider remoto è attivo in questa fase. */
export const COLLAB_PHASE = {
  /** Solo editor locale: nessuna funzione remota implementata. */
  localOnly: true as const,
} as const;

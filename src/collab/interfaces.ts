/**
 * Collaboration support is intentionally NOT implemented in the offline
 * release. These four pure interfaces are the reserved extension points
 * required by the architecture so a future real-time layer can be plugged
 * in without touching the editor core.
 *
 * No implementation in this module may perform network I/O.
 */

export interface CollabPeer {
  id: string;
  name: string;
  color: string;
}

/** Low-level message transport (to be implemented by a future transport). */
export interface CollabTransport {
  connect(endpoint: string): Promise<void>;
  disconnect(): Promise<void>;
  send(message: Uint8Array): void;
  onMessage(handler: (data: Uint8Array) => void): () => void;
  isConnected(): boolean;
}

/** Presence/awareness: who is in the session and where they are editing. */
export interface CollabPresence {
  peers(): CollabPeer[];
  onPeersChanged(handler: (peers: CollabPeer[]) => void): () => void;
  announce(cursorState: unknown): void;
}

/** Document synchronization strategy (e.g. CRDT or OT). */
export interface CollabSync {
  applyRemoteOperations(ops: unknown[]): void;
  localOperations(sinceSequence: number): unknown[];
  snapshot(): Uint8Array;
  restore(snapshot: Uint8Array): void;
}

/** Lifecycle owner for a shared editing session. */
export interface CollabSessionProvider {
  startSession(documentId: string): Promise<void>;
  stopSession(): Promise<void>;
  isInSession(): boolean;
  transport(): CollabTransport;
  presence(): CollabPresence;
  sync(): CollabSync;
}

/**
 * Collaboration extension points — STUB, NOT IMPLEMENTED in milestone 1.
 *
 * The local editor is deliberately collaboration-free (hard requirement of
 * the specification: no accounts, no servers, no network activity). These
 * interfaces exist so that a future milestone can add collaboration without
 * rewriting the application core:
 *
 *   UI  ──►  CollaborationHost (future React context)  ──►  providers
 *                                                    ╲►  store (patches)
 *
 * A provider implementation would:
 * 1. be registered in a `collab/index.ts` registry;
 * 2. receive document changes from the store (already a single source of
 *    truth for buffer contents);
 * 3. surface remote changes back into the store;
 * 4. never touch the Rust fs/build layer directly — all persistence stays
 *    local and file-based.
 */

import type { FileNode } from "../types";

export type CollabStatus = "disconnected" | "connecting" | "connected" | "error";

/** Minimal context handed to a provider when the session starts. */
export interface CollabContext {
  /** Stable identifier of the shared project (future). */
  projectId: string;
  /** Local root of the project, used for path normalization only. */
  projectRoot: string;
}

/** Top-level provider: lifecycle and connection status of a session. */
export interface CollaborationProvider {
  readonly id: string;
  readonly displayName: string;
  readonly status: CollabStatus;
  start(context: CollabContext): Promise<void>;
  stop(): Promise<void>;
}

/** Who is online, where their cursors are. */
export interface PresenceProvider {
  setLocalUser(user: CollabUser): void;
  setLocalCursor(path: string, line: number, column: number): void;
  onPresenceChange(handler: (peers: readonly CollabPeer[]) => void): () => void;
}

export interface CollabUser {
  id: string;
  displayName: string;
  color: string;
}

export interface CollabPeer extends CollabUser {
  cursor: { path: string; line: number; column: number } | null;
}

/** Document-level synchronisation of a single open buffer. */
export interface DocumentSyncProvider {
  openDocument(path: string): Promise<void>;
  closeDocument(path: string): Promise<void>;
  /** Push a local text change (already applied locally). */
  submitLocalChange(path: string, rangeOffset: number, removedLength: number, inserted: string): void;
  /** Subscribe to remote changes; returns an unsubscribe function. */
  onRemoteChange(
    handler: (change: RemoteDocumentChange) => void
  ): () => void;
}

export interface RemoteDocumentChange {
  path: string;
  rangeOffset: number;
  removedLength: number;
  inserted: string;
  revision: number;
}

/** Project-level synchronisation (tree membership and metadata). */
export interface ProjectSyncProvider {
  /** Local tree snapshot to reconcile against the shared one. */
  reconcile(localTree: readonly FileNode[]): Promise<void>;
  onProjectChange(handler: (tree: readonly FileNode[]) => void): () => void;
}

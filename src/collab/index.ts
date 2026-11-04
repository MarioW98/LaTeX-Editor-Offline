// Collaboration extension points (see `providers.ts`).
//
// Milestone 1 exports the interfaces only — no implementation, no network
// code, no runtime behaviour. A future milestone will add a provider
// registry here (e.g. `registerProvider(...)` / `getProviders()`).

export type {
  CollabContext,
  CollabPeer,
  CollabStatus,
  CollabUser,
  CollaborationProvider,
  DocumentSyncProvider,
  PresenceProvider,
  ProjectSyncProvider,
  RemoteDocumentChange,
} from "./providers";

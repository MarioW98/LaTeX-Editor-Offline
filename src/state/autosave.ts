// Debounced autosave for editor buffers. The store calls `schedule()` on
// every content change; timers are per-file and are cancelled on manual save
// or tab close. No imports from the store: everything is injected, so there
// are no circular dependencies.

interface Pending {
  timer: ReturnType<typeof setTimeout> | null;
}

const pending = new Map<string, Pending>();

export function scheduleAutosave(
  path: string,
  save: () => void,
  enabled: boolean,
  delayMs: number
): void {
  cancelAutosave(path);
  if (!enabled) return;
  const delay = Math.max(250, Math.min(60000, delayMs));
  const entry: Pending = { timer: null };
  entry.timer = setTimeout(() => {
    pending.delete(path);
    save();
  }, delay);
  pending.set(path, entry);
}

export function cancelAutosave(path: string): void {
  const entry = pending.get(path);
  if (entry?.timer) clearTimeout(entry.timer);
  pending.delete(path);
}

export function cancelAll(): void {
  for (const path of [...pending.keys()]) cancelAutosave(path);
}

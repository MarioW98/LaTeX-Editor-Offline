/** Registrazione degli eventi di build inviati dal backend Rust. */
import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';
import type { BuildOutputEvent, BuildStatusEvent } from '../utils/ipc';
import { useBuildStore } from '../state/useBuildStore';

export function useBuildEvents(): void {
  useEffect(() => {
    let unOutput: UnlistenFn | null = null;
    let unStatus: UnlistenFn | null = null;
    let cancelled = false;

    void (async () => {
      unOutput = await listen<BuildOutputEvent>('build:output', (e) => {
        useBuildStore.getState().applyOutput(e.payload);
      });
      unStatus = await listen<BuildStatusEvent>('build:status', (e) => {
        useBuildStore.getState().applyStatus(e.payload);
      });
      if (cancelled) {
        unOutput();
        unStatus();
      }
    })();

    return () => {
      cancelled = true;
      unOutput?.();
      unStatus?.();
    };
  }, []);
}

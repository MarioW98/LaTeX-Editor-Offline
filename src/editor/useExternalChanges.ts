/**
 * Rilevamento di modifiche esterne ai file aperti: polling leggero (4 s)
 * più controllo al focus della finestra. Confronta mtime/size con lo stat
 * atteso (aggiornato a ogni salvataggio/caricamento).
 */
import { useEffect } from 'react';
import { ipc } from '../utils/ipc';
import { useEditorStore } from '../state/useEditorStore';
import { useFileChangeStore } from '../state/useFileChangeStore';

const POLL_MS = 4000;

export function useExternalChanges(): void {
  const tabs = useEditorStore((s) => s.tabs);

  useEffect(() => {
    let stopped = false;

    const check = async () => {
      if (stopped || !document.hasFocus()) return;
      const current = useEditorStore.getState().tabs;
      for (const tab of current) {
        if (!tab.expected) continue;
        try {
          const stat = await ipc.fileStat(tab.rel);
          if (!stat.exists) continue;
          if (stat.mtimeMs !== tab.expected.mtimeMs || stat.size !== tab.expected.size) {
            useFileChangeStore.getState().offer(tab, stat);
          }
        } catch {
          /* file rimosso o progetto chiuso: ignora */
        }
      }
    };

    const interval = window.setInterval(() => void check(), POLL_MS);
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [tabs]);
}

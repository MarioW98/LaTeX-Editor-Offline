/** Coda dei file modificati esternamente (una dialog alla volta). */
import { create } from 'zustand';
import type { FileStat } from '../utils/ipc';
import { useEditorStore, type Tab } from './useEditorStore';

interface FileChangeState {
  pending: { tab: Tab; stat: FileStat } | null;
  offer: (tab: Tab, stat: FileStat) => void;
  resolve: (reload: boolean) => Promise<void>;
}

export const useFileChangeStore = create<FileChangeState>()((set, get) => ({
  pending: null,
  offer: (tab, stat) => {
    if (get().pending) return;
    set({ pending: { tab, stat } });
  },
  resolve: async (reload) => {
    const pending = get().pending;
    if (!pending) return;
    set({ pending: null });
    const editor = useEditorStore.getState();
    if (reload) {
      await editor.reloadFromDisk(pending.tab.path);
    } else {
      editor.setExpected(pending.tab.path, pending.stat);
    }
  },
}));

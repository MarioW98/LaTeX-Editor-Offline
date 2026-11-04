/** Store progetto: radice, metadati, albero file, indice etichette. */
import { create } from 'zustand';
import { ipc, errMsg, type FileNode, type LabelsIndex, type ProjectMeta } from '../utils/ipc';
import { useSettingsStore } from './useSettingsStore';
import { useToastStore } from './useToastStore';

interface ProjectState {
  root: string | null;
  meta: ProjectMeta | null;
  tree: FileNode | null;
  labels: LabelsIndex | null;
  openProject: (root: string) => Promise<boolean>;
  createProject: (parentDir: string, name: string, template: string) => Promise<boolean>;
  closeProject: () => void;
  refreshTree: () => Promise<void>;
  loadLabels: () => Promise<void>;
  createEntry: (path: string, isDir: boolean) => Promise<boolean>;
  renameEntry: (from: string, to: string) => Promise<boolean>;
  deleteEntry: (path: string) => Promise<boolean>;
  updateMeta: (patch: Partial<ProjectMeta>) => Promise<void>;
  setMainFile: (rel: string) => Promise<void>;
}

/** Debounce per il refresh etichette dopo i salvataggi. */
let labelTimer: ReturnType<typeof setTimeout> | null = null;

export const useProjectStore = create<ProjectState>()((set, get) => {
  const applySnapshot = async (
    snapshot: { root: string; meta: ProjectMeta; tree: FileNode },
  ) => {
    set({ root: snapshot.root, meta: snapshot.meta, tree: snapshot.tree, labels: null });
    useSettingsStore.getState().setProjectMeta(snapshot.meta);
    await useSettingsStore.getState().pushRecentProject(snapshot.root);
    await get().loadLabels();
  };

  return {
    root: null,
    meta: null,
    tree: null,
    labels: null,

    openProject: async (root) => {
      try {
        const snapshot = await ipc.openProject(root);
        await applySnapshot(snapshot);
        return true;
      } catch (e) {
        useToastStore.getState().push('error', `Impossibile aprire il progetto: ${errMsg(e)}`);
        return false;
      }
    },

    createProject: async (parentDir, name, template) => {
      try {
        const snapshot = await ipc.createProject(parentDir, name, template);
        await applySnapshot(snapshot);
        useToastStore.getState().push('success', `Progetto "${snapshot.meta.name}" creato`);
        return true;
      } catch (e) {
        useToastStore.getState().push('error', `Creazione fallita: ${errMsg(e)}`);
        return false;
      }
    },

    closeProject: () => {
      set({ root: null, meta: null, tree: null, labels: null });
      useSettingsStore.getState().setProjectMeta(null);
    },

    refreshTree: async () => {
      if (!get().root) return;
      try {
        const tree = await ipc.readFileTree();
        set({ tree });
      } catch (e) {
        useToastStore.getState().push('error', `Aggiornamento albero fallito: ${errMsg(e)}`);
      }
    },

    loadLabels: async () => {
      if (!get().root) return;
      try {
        const labels = await ipc.collectLabels();
        set({ labels });
      } catch {
        /* silenzioso: le etichette sono un extra */
      }
    },

    createEntry: async (path, isDir) => {
      try {
        await ipc.createEntry(path, isDir);
        await get().refreshTree();
        return true;
      } catch (e) {
        useToastStore.getState().push('error', errMsg(e));
        return false;
      }
    },

    renameEntry: async (from, to) => {
      try {
        await ipc.renameEntry(from, to);
        await get().refreshTree();
        await get().loadLabels();
        return true;
      } catch (e) {
        useToastStore.getState().push('error', errMsg(e));
        return false;
      }
    },

    deleteEntry: async (path) => {
      try {
        await ipc.deleteEntry(path);
        await get().refreshTree();
        await get().loadLabels();
        return true;
      } catch (e) {
        useToastStore.getState().push('error', errMsg(e));
        return false;
      }
    },

    updateMeta: async (patch) => {
      const meta = get().meta;
      if (!meta) return;
      const next = { ...meta, ...patch };
      try {
        const saved = await ipc.writeProjectSettings(next);
        set({ meta: saved });
        useSettingsStore.getState().setProjectMeta(saved);
      } catch (e) {
        useToastStore.getState().push('error', `Salvataggio project.json fallito: ${errMsg(e)}`);
      }
    },

    setMainFile: async (rel) => {
      await get().updateMeta({ mainFile: rel });
    },
  };
});

/** Refresh etichette con debounce (chiamato dopo i salvataggi). */
export function loadLabelsDebounced(): void {
  if (labelTimer) clearTimeout(labelTimer);
  labelTimer = setTimeout(() => {
    labelTimer = null;
    void useProjectStore.getState().loadLabels();
  }, 1500);
}

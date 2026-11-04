/**
 * Store editor: tab aperti, stato dirty, salvataggio, cursori.
 * I documenti CodeMirror vivono in `editor/docStates` (fuori da Zustand).
 */
import { create } from 'zustand';
import { confirm } from '@tauri-apps/plugin-dialog';
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { ipc, errMsg, type FileStat } from '../utils/ipc';
import { joinPath, basename, extOf } from '../utils/paths';
import { docStates } from '../editor/docStates';
import { baseExtensions } from '../editor/extensions';
import { makeRefJump, type RefTokenKind } from '../editor/latex/refJump';
import { editorApi } from '../editor/editorApi';
import { useProjectStore, loadLabelsDebounced } from './useProjectStore';
import { useToastStore } from './useToastStore';
import { effectiveOf, useSettingsStore } from './useSettingsStore';

export interface Tab {
  /** Percorso assoluto (chiave). */
  path: string;
  /** Percorso relativo al progetto (usato per l'IPC). */
  rel: string;
  name: string;
  dirty: boolean;
  /** Stat atteso del file su disco (rilevamento modifiche esterne). */
  expected: FileStat | null;
}

interface EditorStore {
  tabs: Tab[];
  activePath: string | null;
  cursorLine: number;
  cursorCol: number;
  /** Incrementa quando un documento viene ricreato/sostituito. */
  docVersion: number;
  openFile: (rel: string) => Promise<void>;
  openFileAtLine: (rel: string, line: number) => Promise<void>;
  activate: (path: string) => void;
  close: (path: string) => Promise<void>;
  closeAll: () => void;
  markDirty: (path: string) => void;
  markSaved: (path: string, stat: FileStat) => void;
  setExpected: (path: string, stat: FileStat) => void;
  setCursor: (line: number, col: number) => void;
  onRenamed: (oldRel: string, newRel: string) => void;
  onDeleted: (rel: string) => void;
  saveActive: () => Promise<void>;
  saveTab: (path: string) => Promise<void>;
  saveAllDirty: () => Promise<void>;
  reloadFromDisk: (path: string) => Promise<void>;
}

const REF_KINDS: ReadonlySet<string> = new Set(['ref', 'eqref', 'pageref', 'autoref', 'vref', 'cref', 'Cref']);
const CITE_KINDS: ReadonlySet<string> = new Set([
  'cite', 'citep', 'citet', 'citeauthor', 'citeyear', 'textcite', 'parencite', 'footcite',
]);

export const useEditorStore = create<EditorStore>()((set, get) => {
  /** Estensioni per un nuovo documento: base + ascoltatore + salti \ref. */
  const makeExtensions = (rel: string): Extension[] => {
    const { global, project } = useSettingsStore.getState();
    const eff = effectiveOf(global, project);
    const listener = EditorView.updateListener.of((u) => {
      if (!u.docChanged && !u.selectionSet) return;
      const st = get();
      const path = st.activePath;
      if (!path) return;
      if (u.docChanged) st.markDirty(path);
      if (u.selectionSet) {
        const head = u.state.selection.main.head;
        const line = u.state.doc.lineAt(head);
        st.setCursor(line.number, head - line.from + 1);
      }
    });
    const refJump = makeRefJump({
      onToken: (kind: RefTokenKind, arg: string) => handleRefToken(kind, arg),
    });
    return [...baseExtensions(rel, eff.wordWrap), listener, refJump];
  };

  /** Ctrl/Cmd+clic su \ref/\cite/\input: apre la definizione. */
  const handleRefToken = (kind: RefTokenKind, arg: string): void => {
    const toast = useToastStore.getState().push;
    const { labels } = useProjectStore.getState();
    if (REF_KINDS.has(kind)) {
      const hit = labels?.labels.find((l) => l.name === arg);
      if (hit) void get().openFileAtLine(hit.file, hit.line);
      else toast('info', `Etichetta "${arg}" non trovata nel progetto.`);
    } else if (CITE_KINDS.has(kind)) {
      const first = arg.split(',')[0].trim();
      const hit = labels?.bibKeys.find((b) => b.key === first);
      if (hit) void get().openFileAtLine(hit.file, hit.line);
      else toast('info', `Chiave bibliografica "${first}" non trovata.`);
    } else if (kind === 'input' || kind === 'include') {
      let rel = arg;
      if (!extOf(rel)) rel += '.tex';
      void get().openFile(rel);
    } else if (kind === 'bibliography') {
      let rel = arg.split(',')[0].trim();
      if (!extOf(rel)) rel += '.bib';
      void get().openFile(rel);
    } else if (kind === 'label') {
      toast('info', `"${arg}" è una definizione di etichetta.`);
    }
  };

  const removeTab = (path: string) => {
    docStates.delete(path);
    set((s) => {
      const tabs = s.tabs.filter((t) => t.path !== path);
      const activePath =
        s.activePath === path ? (tabs.length > 0 ? tabs[tabs.length - 1].path : null) : s.activePath;
      return { tabs, activePath, docVersion: s.docVersion + 1 };
    });
  };

  return {
    tabs: [],
    activePath: null,
    cursorLine: 1,
    cursorCol: 1,
    docVersion: 0,

    openFile: async (rel) => {
      const root = useProjectStore.getState().root;
      if (!root) {
        useToastStore.getState().push('error', 'Nessun progetto aperto.');
        return;
      }
      const path = joinPath(root, rel);
      if (get().tabs.some((t) => t.path === path)) {
        get().activate(path);
        return;
      }
      try {
        const content = await ipc.readFile(rel);
        docStates.create(path, rel, content.text, makeExtensions(rel));
        docStates.setWrap(path, effectiveOf(useSettingsStore.getState().global, useSettingsStore.getState().project).wordWrap);
        set((s) => ({
          tabs: [...s.tabs, { path, rel, name: basename(rel), dirty: false, expected: content.stat }],
          activePath: path,
        }));
      } catch (e) {
        useToastStore.getState().push('error', `Impossibile aprire ${rel}: ${errMsg(e)}`);
      }
    },

    openFileAtLine: async (rel, line) => {
      await get().openFile(rel);
      const root = useProjectStore.getState().root;
      if (!root) return;
      editorApi.requestGoto(joinPath(root, rel), line);
      // Forza il ri-applicazione se il file era già attivo.
      set((s) => ({ docVersion: s.docVersion + 1 }));
    },

    activate: (path) => {
      if (get().activePath !== path) set({ activePath: path });
    },

    close: async (path) => {
      const tab = get().tabs.find((t) => t.path === path);
      if (!tab) return;
      if (tab.dirty) {
        let ok = true;
        try {
          ok = await confirm(`"${tab.name}" ha modifiche non salvate. Chiudere senza salvare?`, {
            title: 'Chiudi file',
            kind: 'warning',
          });
        } catch {
          ok = true;
        }
        if (!ok) return;
      }
      removeTab(path);
    },

    closeAll: () => {
      docStates.clear();
      set((s) => ({ tabs: [], activePath: null, docVersion: s.docVersion + 1 }));
    },

    markDirty: (path) =>
      set((s) => ({ tabs: s.tabs.map((t) => (t.path === path ? { ...t, dirty: true } : t)) })),

    markSaved: (path, stat) =>
      set((s) => ({
        tabs: s.tabs.map((t) => (t.path === path ? { ...t, dirty: false, expected: stat } : t)),
      })),

    setExpected: (path, stat) =>
      set((s) => ({
        tabs: s.tabs.map((t) => (t.path === path ? { ...t, expected: stat } : t)),
      })),

    setCursor: (line, col) => set({ cursorLine: line, cursorCol: col }),

    onRenamed: (oldRel, newRel) => {
      const root = useProjectStore.getState().root;
      if (!root) return;
      const oldPath = joinPath(root, oldRel);
      const newPath = joinPath(root, newRel);
      docStates.rename(oldPath, newPath);
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.path === oldPath ? { ...t, path: newPath, rel: newRel, name: basename(newRel) } : t,
        ),
        activePath: s.activePath === oldPath ? newPath : s.activePath,
        docVersion: s.docVersion + 1,
      }));
    },

    onDeleted: (rel) => {
      const root = useProjectStore.getState().root;
      if (!root) return;
      removeTab(joinPath(root, rel));
    },

    saveActive: async () => {
      const path = get().activePath;
      if (!path) return;
      await get().saveTab(path);
    },

    saveTab: async (path) => {
      const tab = get().tabs.find((t) => t.path === path);
      if (!tab) return;
      const state = docStates.get(path);
      if (!state) return;
      try {
        const stat = await ipc.writeFile(tab.rel, state.doc.toString());
        get().markSaved(path, stat);
        if (['tex', 'bib', 'sty', 'cls'].includes(extOf(tab.rel))) {
          loadLabelsDebounced();
        }
      } catch (e) {
        useToastStore.getState().push('error', `Salvataggio di ${tab.name} fallito: ${errMsg(e)}`);
      }
    },

    saveAllDirty: async () => {
      const dirty = get().tabs.filter((t) => t.dirty);
      for (const t of dirty) {
        await get().saveTab(t.path);
      }
    },

    reloadFromDisk: async (path) => {
      const tab = get().tabs.find((t) => t.path === path);
      if (!tab) return;
      try {
        const content = await ipc.readFile(tab.rel);
        docStates.create(path, tab.rel, content.text, makeExtensions(tab.rel));
        docStates.setWrap(path, effectiveOf(useSettingsStore.getState().global, useSettingsStore.getState().project).wordWrap);
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.path === path ? { ...t, dirty: false, expected: content.stat } : t,
          ),
          docVersion: s.docVersion + 1,
        }));
      } catch (e) {
        useToastStore.getState().push('error', `Ricaricamento fallito: ${errMsg(e)}`);
      }
    },
  };
});

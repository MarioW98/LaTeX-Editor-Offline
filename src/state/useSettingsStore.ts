/** Store impostazioni: globali (persistite nel profilo app) + progetto corrente. */
import { create } from 'zustand';
import { ipc, errMsg, type GlobalSettings, type LatexInfo, type ProjectMeta } from '../utils/ipc';

export const DEFAULT_GLOBAL: GlobalSettings = {
  latexBinDir: null,
  defaultEngine: 'pdflatex',
  autosave: false,
  autosaveDelayMs: 1500,
  editorFontSize: 14,
  wordWrap: true,
  theme: 'dark',
  warnShellEscape: true,
  allowShellEscape: false,
  recentProjects: [],
};

/** Impostazioni effettive = globali con override del progetto. */
export interface EffectiveSettings {
  autosave: boolean;
  autosaveDelayMs: number;
  editorFontSize: number;
  wordWrap: boolean;
  warnShellEscape: boolean;
}

export function effectiveOf(g: GlobalSettings, p: ProjectMeta | null): EffectiveSettings {
  return {
    autosave: p?.settings.autosave ?? g.autosave,
    autosaveDelayMs: p?.settings.autosaveDelayMs ?? g.autosaveDelayMs,
    editorFontSize: p?.settings.editorFontSize ?? g.editorFontSize,
    wordWrap: p?.settings.wordWrap ?? g.wordWrap,
    warnShellEscape: p?.settings.warnShellEscape ?? g.warnShellEscape,
  };
}

interface SettingsState {
  ready: boolean;
  global: GlobalSettings;
  project: ProjectMeta | null;
  latex: LatexInfo | null;
  latexChecking: boolean;
  init: () => Promise<void>;
  setProjectMeta: (meta: ProjectMeta | null) => void;
  saveGlobal: (patch: Partial<GlobalSettings>) => Promise<void>;
  setLatex: (info: LatexInfo | null) => void;
  recheckLatex: () => Promise<void>;
  pushRecentProject: (root: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  ready: false,
  global: DEFAULT_GLOBAL,
  project: null,
  latex: null,
  latexChecking: false,

  init: async () => {
    let global = DEFAULT_GLOBAL;
    try {
      global = await ipc.readGlobalSettings();
    } catch (e) {
      console.warn('impossibile leggere le impostazioni globali:', errMsg(e));
    }
    set({ global, ready: true });
    await get().recheckLatex();
  },

  setProjectMeta: (meta) => set({ project: meta }),

  saveGlobal: async (patch) => {
    const next = { ...get().global, ...patch };
    set({ global: next });
    try {
      await ipc.writeGlobalSettings(next);
    } catch (e) {
      console.error('salvataggio impostazioni globali fallito:', errMsg(e));
      throw e;
    }
  },

  setLatex: (info) => set({ latex: info }),

  recheckLatex: async () => {
    set({ latexChecking: true });
    try {
      const latex = await ipc.detectLatex(get().global.latexBinDir);
      set({ latex });
    } catch (e) {
      console.warn('rilevamento LaTeX fallito:', errMsg(e));
      set({ latex: null });
    } finally {
      set({ latexChecking: false });
    }
  },

  pushRecentProject: async (root) => {
    const recent = [root, ...get().global.recentProjects.filter((r) => r !== root)].slice(0, 8);
    try {
      await get().saveGlobal({ recentProjects: recent });
    } catch {
      /* non bloccare l'apertura del progetto per i recenti */
    }
  },
}));

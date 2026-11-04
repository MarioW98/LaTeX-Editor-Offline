// Application store (Zustand). Single source of truth for:
// current project, open tabs, build state, settings, latex detection and UI.
//
// Layering (no circular dependencies):
//   UI components -> store -> ipc (typed Tauri layer) -> Rust commands

import { create } from "zustand";

import * as ipc from "../tauri/ipc";
import type {
  BuildFinishedEvent,
  BuildLineEvent,
  BuildStatus,
  FileEntry,
  GlobalSettings,
  LatexReport,
  LogIssue,
  ProjectInfo,
  ProjectSettings,
  TemplateInfo,
  ThemeName,
} from "../types";
import {
  basename,
  escapeRegExp,
  flattenFiles,
} from "../utils/misc";
import { cancelAll, cancelAutosave, scheduleAutosave } from "./autosave";

export interface Tab {
  path: string;
  name: string;
  content: string;
  savedContent: string;
  openedMtime: number;
  /** bumped when the content is replaced from outside (tab switch / reload) */
  reloadToken: number;
}

export interface BuildState {
  status: BuildStatus;
  buildId: number | null;
  engine: string;
  output: string[];
  issues: LogIssue[];
  pdfPath: string | null;
  /** path of the last *successful* build, kept to show it on later errors */
  lastGoodPdfPath: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  durationMs: number | null;
  message: string | null;
}

export interface PendingReveal {
  path: string;
  line: number;
  token: number;
}

export interface ExternalChange {
  path: string;
  name: string;
}

interface UiState {
  leftPanel: boolean;
  rightPanel: boolean;
  bottomPanel: boolean;
  bottomTab: "problems" | "log";
  settingsOpen: boolean;
  newProjectOpen: boolean;
}

interface AppStore {
  // project
  projectRoot: string | null;
  projectName: string;
  hasProjectJson: boolean;
  tree: FileEntry[];
  expandedDirs: Record<string, boolean>;

  // tabs
  tabs: Tab[];
  activeTabPath: string | null;
  cursor: { line: number; col: number };
  pendingReveal: PendingReveal | null;

  // build
  build: BuildState;

  // settings & toolchain
  globalSettings: GlobalSettings;
  projectSettings: ProjectSettings;
  latex: LatexReport | null;
  latexDetecting: boolean;
  templates: TemplateInfo[];

  // ui
  ui: UiState;
  statusMessage: string | null;
  externalChanges: ExternalChange[];
  lastSavedAt: number | null;

  // actions: bootstrap / detection
  bootstrap: () => Promise<void>;
  detectLatex: () => Promise<void>;

  // actions: project
  openProject: (root: string) => Promise<void>;
  updateRecents: (root: string) => Promise<void>;
  closeProject: () => void;
  refreshTree: () => Promise<void>;
  toggleDir: (path: string) => void;
  collapseAllDirs: () => void;

  // actions: tabs / files
  openFile: (path: string, line?: number) => Promise<void>;
  closeTab: (path: string) => void;
  activateTab: (path: string) => void;
  setTabContent: (path: string, content: string) => void;
  saveTab: (path?: string) => Promise<void>;
  saveActiveTab: () => Promise<void>;
  setCursor: (line: number, col: number) => void;
  consumeReveal: () => PendingReveal | null;
  openFileAtLine: (path: string, line: number) => Promise<void>;
  jumpToLabel: (label: string) => Promise<void>;

  // actions: fs operations
  createEntry: (path: string, isDir: boolean) => Promise<void>;
  renameEntry: (oldPath: string, newPath: string) => Promise<void>;
  deleteEntry: (path: string) => Promise<void>;

  // actions: build
  startBuild: () => Promise<void>;
  cancelBuild: () => Promise<void>;
  appendBuildLine: (line: BuildLineEvent) => void;
  finishBuild: (ev: BuildFinishedEvent) => void;
  clearBuildOutput: () => void;
  reloadPdf: () => void;
  pdfReloadToken: number;

  // actions: settings
  updateGlobalSettings: (patch: Partial<GlobalSettings>) => Promise<void>;
  updateProjectSettings: (patch: Partial<ProjectSettings>) => Promise<void>;

  // actions: external changes
  checkExternalChanges: () => Promise<void>;
  reloadExternalFiles: (paths: string[]) => Promise<void>;
  dismissExternalChanges: () => void;

  // actions: ui
  setUi: (patch: Partial<UiState>) => void;
  setTemplates: (list: TemplateInfo[]) => void;
  setStatusMessage: (msg: string | null) => void;
  toggleTheme: () => Promise<void>;
}

function initialBuild(): BuildState {
  return {
    status: "idle",
    buildId: null,
    engine: "pdflatex",
    output: [],
    issues: [],
    pdfPath: null,
    lastGoodPdfPath: null,
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    message: null,
  };
}

// Output-line batching: flush at most every 100 ms to keep renders cheap.
let pendingLines: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

let revealToken = 0;
let statusTimer: ReturnType<typeof setTimeout> | null = null;

export const useAppStore = create<AppStore>()((set, get) => ({
  projectRoot: null,
  projectName: "",
  hasProjectJson: false,
  tree: [],
  expandedDirs: {},

  tabs: [],
  activeTabPath: null,
  cursor: { line: 1, col: 1 },
  pendingReveal: null,

  build: initialBuild(),

  globalSettings: {
    theme: "dark",
    fontSize: 14,
    wordWrap: false,
    defaultEngine: "pdflatex",
    autosaveEnabled: true,
    autosaveDelayMs: 1500,
    latexPathOverride: null,
    recentProjects: [],
  },
  projectSettings: {
    mainFile: "main.tex",
    engine: "pdflatex",
    outputDir: ".latex-editor/build",
    useLatexmk: true,
    shellEscape: false,
  },
  latex: null,
  latexDetecting: false,
  templates: [],

  ui: {
    leftPanel: true,
    rightPanel: true,
    bottomPanel: true,
    bottomTab: "problems",
    settingsOpen: false,
    newProjectOpen: false,
  },
  statusMessage: null,
  externalChanges: [],
  lastSavedAt: null,

  // ------------------------------------------------------------- bootstrap --

  bootstrap: async () => {
    try {
      const g = await ipc.getGlobalSettings();
      set({ globalSettings: g });
    } catch (e) {
      console.warn("Impossibile leggere le impostazioni globali:", e);
    }
    void get().detectLatex();
    try {
      const templates = await ipc.listTemplates();
      set({ templates });
    } catch (e) {
      console.warn("Impossibile leggere i modelli:", e);
    }
  },

  detectLatex: async () => {
    set({ latexDetecting: true });
    try {
      const report = await ipc.detectLatex();
      set({ latex: report });
    } catch (e) {
      console.warn("Rilevamento LaTeX fallito:", e);
    } finally {
      set({ latexDetecting: false });
    }
  },

  // -------------------------------------------------------------- project --

  openProject: async (root) => {
    const info: ProjectInfo = await ipc.openProject(root);
    cancelAll();
    set({
      projectRoot: info.root,
      projectName: info.name,
      hasProjectJson: info.hasProjectJson,
      tree: info.tree,
      expandedDirs: {},
      tabs: [],
      activeTabPath: null,
      pendingReveal: null,
      build: initialBuild(),
      projectSettings: info.settings,
    });
    void get().updateRecents(info.root);
    // restore the last compiled PDF when it exists
    try {
      const pdf = await ipc.getBuiltPdfPath(
        info.root,
        info.settings.mainFile,
        info.settings.outputDir
      );
      if (pdf) set((s) => ({ build: { ...s.build, lastGoodPdfPath: pdf } }));
    } catch {
      /* il PDF precedente non è disponibile: non è un errore */
    }
  },

  // NOTE: `updateRecents` is declared in the AppStore interface above and
  // implemented as a regular action.
  updateRecents: async (root: string) => {
    const g = get().globalSettings;
    const recents = [root, ...g.recentProjects.filter((p) => p !== root)].slice(0, 10);
    const next = { ...g, recentProjects: recents };
    set({ globalSettings: next });
    try {
      await ipc.saveGlobalSettings(next);
    } catch (e) {
      console.warn("Impossibile salvare i progetti recenti:", e);
    }
  },

  closeProject: () => {
    cancelAll();
    set({
      projectRoot: null,
      projectName: "",
      tree: [],
      expandedDirs: {},
      tabs: [],
      activeTabPath: null,
      build: initialBuild(),
      externalChanges: [],
    });
  },

  refreshTree: async () => {
    const root = get().projectRoot;
    if (!root) return;
    try {
      const tree = await ipc.readTree(root);
      set({ tree });
    } catch (e) {
      get().setStatusMessage(`Impossibile aggiornare l'albero file: ${String(e)}`);
    }
  },

  toggleDir: (path) => {
    set((s) => ({ expandedDirs: { ...s.expandedDirs, [path]: !s.expandedDirs[path] } }));
  },

  collapseAllDirs: () => set({ expandedDirs: {} }),

  // ----------------------------------------------------------- tabs/files --

  openFile: async (path, line) => {
    const root = get().projectRoot;
    if (!root) return;
    const existing = get().tabs.find((t) => t.path === path);
    if (existing) {
      set({ activeTabPath: path });
    } else {
      try {
        const content = await ipc.readFile(root, path);
        const stat = await ipc.statFile(root, path).catch(() => null);
        const tab: Tab = {
          path,
          name: basename(path),
          content,
          savedContent: content,
          openedMtime: stat ? stat.mtimeMs : 0,
          reloadToken: 0,
        };
        set((s) => ({ tabs: [...s.tabs, tab], activeTabPath: path }));
      } catch (e) {
        get().setStatusMessage(`Impossibile aprire il file: ${String(e)}`);
      }
    }
    if (typeof line === "number") {
      await get().openFileAtLine(path, line);
    }
  },

  closeTab: (path) => {
    cancelAutosave(path);
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.path === path);
      const tabs = s.tabs.filter((t) => t.path !== path);
      let active = s.activeTabPath;
      if (active === path) {
        active = tabs.length > 0 ? tabs[Math.min(idx, tabs.length - 1)].path : null;
      }
      return { tabs, activeTabPath: active };
    });
  },

  activateTab: (path) => set({ activeTabPath: path }),

  setTabContent: (path, content) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, content } : t)),
    }));
    const g = get().globalSettings;
    scheduleAutosave(
      path,
      () => void get().saveTab(path),
      g.autosaveEnabled,
      g.autosaveDelayMs
    );
  },

  saveTab: async (pathArg) => {
    const root = get().projectRoot;
    const path = pathArg ?? get().activeTabPath;
    if (!root || !path) return;
    const tab = get().tabs.find((t) => t.path === path);
    if (!tab) return;
    cancelAutosave(path);
    try {
      const stat = await ipc.writeFile(root, path, tab.content);
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.path === path ? { ...t, savedContent: t.content, openedMtime: stat.mtimeMs } : t
        ),
        lastSavedAt: Date.now(),
      }));
    } catch (e) {
      get().setStatusMessage(`Salvataggio non riuscito: ${String(e)}`);
    }
  },

  saveActiveTab: async () => {
    await get().saveTab();
  },

  setCursor: (line, col) => set({ cursor: { line, col } }),

  consumeReveal: () => {
    const reveal = get().pendingReveal;
    if (reveal) set({ pendingReveal: null });
    return reveal;
  },

  openFileAtLine: async (path, line) => {
    await get().openFile(path);
    revealToken += 1;
    set({ pendingReveal: { path, line, token: revealToken } });
  },

  jumpToLabel: async (label) => {
    const pattern = new RegExp(`\\\\label\\{${escapeRegExp(label)}\\}`);
    for (const t of get().tabs) {
      const m = pattern.exec(t.content);
      if (m) {
        const line = t.content.slice(0, m.index).split("\n").length;
        await get().openFileAtLine(t.path, line);
        return;
      }
    }
    const root = get().projectRoot;
    if (root) {
      const files = flattenFiles(get().tree).filter((f) =>
        /\.(tex|sty|cls)$/i.test(f.name)
      );
      for (const f of files.slice(0, 300)) {
        try {
          const content = await ipc.readFile(root, f.path);
          const m = pattern.exec(content);
          if (m) {
            const line = content.slice(0, m.index).split("\n").length;
            await get().openFileAtLine(f.path, line);
            return;
          }
        } catch {
          /* file non leggibile: ignora */
        }
      }
    }
    get().setStatusMessage(`Etichetta '${label}' non trovata.`);
  },

  // ---------------------------------------------------------- fs operations --

  createEntry: async (path, isDir) => {
    const root = get().projectRoot;
    if (!root) return;
    try {
      await ipc.createEntry(root, path, isDir);
      await get().refreshTree();
    } catch (e) {
      get().setStatusMessage(String(e));
    }
  },

  renameEntry: async (oldPath, newPath) => {
    const root = get().projectRoot;
    if (!root) return;
    try {
      await ipc.renameEntry(root, oldPath, newPath);
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.path === oldPath ? { ...t, path: newPath, name: basename(newPath) } : t
        ),
        activeTabPath: s.activeTabPath === oldPath ? newPath : s.activeTabPath,
      }));
      await get().refreshTree();
    } catch (e) {
      get().setStatusMessage(String(e));
    }
  },

  deleteEntry: async (path) => {
    const root = get().projectRoot;
    if (!root) return;
    try {
      await ipc.deleteEntry(root, path);
      cancelAutosave(path);
      set((s) => {
        const tabs = s.tabs.filter((t) => t.path !== path);
        const active =
          s.activeTabPath === path
            ? tabs.length > 0
              ? tabs[tabs.length - 1].path
              : null
            : s.activeTabPath;
        return { tabs, activeTabPath: active };
      });
      await get().refreshTree();
    } catch (e) {
      get().setStatusMessage(String(e));
    }
  },

  // ---------------------------------------------------------------- build --

  startBuild: async () => {
    const root = get().projectRoot;
    if (!root || get().build.status === "running") return;
    const ps = get().projectSettings;
    set((s) => ({
      build: {
        ...initialBuild(),
        status: "running",
        engine: ps.engine,
        startedAt: Date.now(),
        lastGoodPdfPath: s.build.lastGoodPdfPath,
      },
    }));
    try {
      const id = await ipc.startBuild({
        projectRoot: root,
        mainFile: ps.mainFile,
        engine: ps.engine,
        outputDir: ps.outputDir,
        useLatexmk: ps.useLatexmk,
        shellEscape: ps.shellEscape,
      });
      set((s) => ({ build: { ...s.build, buildId: id } }));
    } catch (e) {
      set((s) => ({
        build: { ...s.build, status: "error", message: String(e), finishedAt: Date.now() },
      }));
    }
  },

  cancelBuild: async () => {
    const id = get().build.buildId;
    if (id == null) return;
    try {
      await ipc.cancelBuild(id);
    } catch {
      /* la compilazione potrebbe essere già terminata */
    }
  },

  appendBuildLine: (line) => {
    pendingLines.push(line.text);
    if (flushTimer === null) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        const lines = pendingLines;
        pendingLines = [];
        set((s) => {
          const output = [...s.build.output, ...lines];
          if (output.length > 4000) output.splice(0, output.length - 4000);
          return { build: { ...s.build, output } };
        });
      }, 100);
    }
  },

  finishBuild: (ev) => {
    // flush pending output lines first
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    const lines = pendingLines;
    pendingLines = [];
    set((s) => {
      const output = [...s.build.output, ...lines];
      if (output.length > 4000) output.splice(0, output.length - 4000);
      const lastGood =
        ev.status === "success" && ev.pdfPath ? ev.pdfPath : s.build.lastGoodPdfPath;
      return {
        build: {
          ...s.build,
          status: ev.status,
          issues: ev.issues,
          pdfPath: ev.pdfPath,
          lastGoodPdfPath: lastGood,
          output,
          durationMs: ev.durationMs,
          message: ev.message,
          finishedAt: Date.now(),
        },
      };
    });
  },

  clearBuildOutput: () => {
    pendingLines = [];
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    set((s) => ({ build: { ...s.build, output: [], issues: [] } }));
  },

  pdfReloadToken: 0,

  reloadPdf: () => set((s) => ({ pdfReloadToken: s.pdfReloadToken + 1 })),

  // ------------------------------------------------------------- settings --

  updateGlobalSettings: async (patch) => {
    const next = { ...get().globalSettings, ...patch };
    set({ globalSettings: next });
    try {
      await ipc.saveGlobalSettings(next);
    } catch (e) {
      get().setStatusMessage(`Impossibile salvare le impostazioni: ${String(e)}`);
    }
  },

  updateProjectSettings: async (patch) => {
    const next = { ...get().projectSettings, ...patch };
    set({ projectSettings: next });
    const root = get().projectRoot;
    if (root) {
      try {
        await ipc.saveProjectSettings(root, next);
      } catch (e) {
        get().setStatusMessage(`Impostazioni progetto non salvate: ${String(e)}`);
      }
    }
  },

  // ------------------------------------------------------ external changes --

  checkExternalChanges: async () => {
    const root = get().projectRoot;
    if (!root || get().build.status === "running") return;
    const changed: ExternalChange[] = [];
    for (const t of get().tabs) {
      try {
        const stat = await ipc.statFile(root, t.path);
        if (stat.mtimeMs > t.openedMtime + 500) {
          changed.push({ path: t.path, name: t.name });
        }
      } catch {
        changed.push({ path: t.path, name: t.name }); // file deleted externally
      }
    }
    if (changed.length > 0) set({ externalChanges: changed });
  },

  reloadExternalFiles: async (paths) => {
    const root = get().projectRoot;
    if (!root) return;
    for (const path of paths) {
      try {
        const content = await ipc.readFile(root, path);
        const stat = await ipc.statFile(root, path).catch(() => null);
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.path === path
              ? {
                  ...t,
                  content,
                  savedContent: content,
                  openedMtime: stat ? stat.mtimeMs : 0,
                  reloadToken: t.reloadToken + 1,
                }
              : t
          ),
        }));
      } catch {
        get().closeTab(path);
      }
    }
    set({ externalChanges: [] });
  },

  dismissExternalChanges: () => {
    // keep the current buffers, just update the baseline mtime so we do not
    // ask again immediately
    const root = get().projectRoot;
    set({ externalChanges: [] });
    if (root) {
      for (const t of get().tabs) {
        void ipc
          .statFile(root, t.path)
          .then((stat) =>
            set((s) => ({
              tabs: s.tabs.map((x) =>
                x.path === t.path ? { ...x, openedMtime: stat.mtimeMs } : x
              ),
            }))
          )
          .catch(() => undefined);
      }
    }
  },

  // -------------------------------------------------------------------- ui --

  setUi: (patch) => set((s) => ({ ui: { ...s.ui, ...patch } })),

  setTemplates: (list) => set({ templates: list }),

  setStatusMessage: (msg) => {
    if (statusTimer !== null) clearTimeout(statusTimer);
    set({ statusMessage: msg });
    if (msg !== null) {
      statusTimer = setTimeout(() => set({ statusMessage: null }), 5000);
    }
  },

  toggleTheme: async () => {
    const next: ThemeName = get().globalSettings.theme === "dark" ? "light" : "dark";
    await get().updateGlobalSettings({ theme: next });
  },
}));

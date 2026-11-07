import { create } from "zustand";
import { api } from "../api.ts";
import {
  DEFAULT_PROJECT_SETTINGS,
  type AppSettings,
  type Engine,
  type FileNode,
  type LatexStatus,
  type LogLine,
  type ProjectSettings,
} from "../types.ts";
import { TEMPLATES } from "../features/templates.ts";
import { describeBuildStartError } from "../latex/latexStatusUi.ts";
import {
  mapUpdaterError,
  realUpdaterPort,
  type CheckedUpdate,
  type UpdaterPort,
} from "../updater/updaterService.ts";

interface OpenTab {
  path: string;
}

interface PendingJump {
  path: string;
  line: number;
  nonce: number;
}

/**
 * Macchina a stati dell'aggiornamento (MU.3):
 *   idle → checking → available{versione, note} | up-to-date | error{messaggio}
 *   available → downloading{progress} → ready → (riavvio)
 * Gli errori di rete finiscono SEMPRE in `error` con un messaggio visibile:
 * mai silenzio. Nessuna transizione parte da sola: solo click dell'utente.
 * M0.7.2: il messaggio è il titolo italiano azionabile (mapUpdaterError);
 * il dettaglio tecnico del plugin resta come riga SECONDARIA (`detail`),
 * mai come prima riga e mai grezzo.
 */
export type UpdateUiState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "up-to-date" }
  | { phase: "available"; version: string; notes: string | null }
  | { phase: "downloading"; version: string; received: number; total: number | null }
  | { phase: "ready"; version: string }
  | { phase: "error"; message: string; detail: string | null };

export interface StoreState {
  rootPath: string | null;
  tree: FileNode[];
  tabs: OpenTab[];
  activeTab: string | null;
  buffers: Record<string, string>;
  dirty: Record<string, boolean>;
  binaryPaths: Record<string, true>;
  pendingJump: PendingJump | null;
  settings: ProjectSettings;
  appSettings: AppSettings;
  latex: LatexStatus | null;
  buildRunning: boolean;
  buildLog: LogLine[];
  /** Dialog di guida aperto da build() quando start_build è respinto dal
   * gate del toolchain (M0.7.1): titolo e corpo del messaggio azionabile. */
  buildDialog: { title: string; body: string } | null;
  closeBuildDialog: () => void;
  lastBuildSuccess: boolean | null;
  lastBuildDurationMs: number | null;
  pdfVersion: number;
  outputOpen: boolean;
  pdfOpen: boolean;
  sidebarOpen: boolean;
  settingsOpen: boolean;
  welcomeAction: "none" | "template";
  selectedTemplateId: string;

  /** Sezione aggiornamenti (MU.3) — vedi UpdateUiState. */
  update: UpdateUiState;
  /** Porta updater iniettabile nei test (default: adapter reale). */
  updaterPort: UpdaterPort;
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  resetUpdateUi: () => void;
  /** Salva su disco TUTTI i buffer sporchi (usata prima di installare). */
  saveAllDirty: () => Promise<void>;

  bootstrap: () => Promise<void>;
  setRoot: (root: string | null) => Promise<void>;
  openProjectFolder: () => Promise<void>;
  refreshTree: () => Promise<void>;
  openFile: (path: string) => Promise<void>;
  closeTab: (path: string) => void;
  setActiveTab: (path: string) => void;
  updateBuffer: (path: string, content: string) => void;
  saveFile: (path: string) => Promise<void>;
  jumpTo: (file: string, line: number) => Promise<void>;
  createProjectFromTemplate: (templateId: string, projectName: string) => Promise<void>;
  createItem: (parent: string, name: string, kind: "file" | "dir") => Promise<void>;
  renameItem: (path: string, newName: string) => Promise<void>;
  deleteItem: (path: string) => Promise<void>;
  updateSettings: (patch: Partial<ProjectSettings>) => Promise<void>;
  detectLatex: () => Promise<void>;
  build: () => Promise<void>;
  cancelBuild: () => Promise<void>;
  appendLog: (line: LogLine) => void;
  clearLog: () => void;
  setBuildFinished: (payload: {
    success: boolean;
    cancelled: boolean;
    durationMs: number;
  }) => void;
  toggleOutput: () => void;
  togglePdf: () => void;
  toggleSidebar: () => void;
  setSettingsOpen: (open: boolean) => void;
  setWelcomeAction: (a: "none" | "template") => void;
  setSelectedTemplateId: (id: string) => void;
}

// Debounce timers for autosave, one per file path.
// Exported only so the discriminant tests can assert that no timer is ever
// armed for a non-modifiable file (see src/state/store.autosave.test.ts)
// and that closing a tab cancels its pending timer
// (see src/state/store.tabs.test.ts).
export const autosaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Cancels the pending autosave timer of `path`, if any. Called when the
 * tab is closed or renamed: a timer left alive would fire after the fact
 * and rewrite the buffer on disk — in the rename case under the OLD path,
 * recreating the file just renamed.
 */
export function clearPendingAutosave(path: string) {
  const t = autosaveTimers.get(path);
  if (t) clearTimeout(t);
  autosaveTimers.delete(path);
}

/** Handle dell'aggiornamento trovato dall'ultimo check (non è stato UI). */
let updateHandle: CheckedUpdate | null = null;

function relToRoot(file: string, root: string): string | null {
  let f = file.replace(/\\/g, "/");
  const r = root.replace(/\\/g, "/").replace(/\/+$/, "");
  if (f.startsWith(r + "/")) f = f.slice(r.length + 1);
  while (f.startsWith("./")) f = f.slice(2);
  if (f.includes("/.latex-editor/")) return null;
  if (f.startsWith("/") || /^[a-zA-Z]:/.test(f)) return null;
  return f;
}

export const useStore = create<StoreState>()((set, get) => ({
  rootPath: null,
  tree: [],
  tabs: [],
  activeTab: null,
  buffers: {},
  dirty: {},
  binaryPaths: {},
  pendingJump: null,
  settings: { ...DEFAULT_PROJECT_SETTINGS },
  appSettings: { lastProject: null, recentProjects: [] },
  latex: null,
  buildRunning: false,
  buildLog: [],
  buildDialog: null,
  lastBuildSuccess: null,
  lastBuildDurationMs: null,
  pdfVersion: 0,
  outputOpen: true,
  pdfOpen: true,
  sidebarOpen: true,
  settingsOpen: false,
  welcomeAction: "none",
  selectedTemplateId: "article",

  update: { phase: "idle" },
  updaterPort: realUpdaterPort,

  bootstrap: async () => {
    get().detectLatex();
    try {
      const app = await api.getAppSettings();
      set({ appSettings: app });
      if (app.lastProject && typeof app.lastProject === "string") {
        try {
          await get().setRoot(app.lastProject);
          return;
        } catch {
          /* project folder vanished: fall through to welcome screen */
        }
      }
    } catch {
      /* settings unavailable: show welcome */
    }
  },

  setRoot: async (root) => {
    // Switching project (or closing it) in the middle of a build: cancel the
    // running build first and reset its state, so the new project is
    // compilable immediately and the logs of the two projects never mix.
    if (get().buildRunning) {
      await get().cancelBuild();
      set({ buildRunning: false, buildLog: [], lastBuildSuccess: null });
    }
    // Every pending autosave timer is armed with a RELATIVE path: after the
    // switch it would write into the wrong project (a same-named file exists
    // in almost every LaTeX project). Empty the whole map.
    for (const p of [...autosaveTimers.keys()]) clearPendingAutosave(p);
    if (!root) {
      set({ rootPath: null, tree: [], tabs: [], activeTab: null, buffers: {}, dirty: {}, binaryPaths: {}, buildLog: [], lastBuildSuccess: null });
      return;
    }
    const tree = await api.readFileTree(root);
    let settings: ProjectSettings = { ...DEFAULT_PROJECT_SETTINGS };
    try {
      const s = await api.getProjectSettings(root);
      if (s && typeof s === "object") {
        settings = { ...DEFAULT_PROJECT_SETTINGS, ...s };
      }
    } catch {
      /* keep defaults */
    }
    set({
      rootPath: root,
      tree,
      settings,
      tabs: [],
      activeTab: null,
      buffers: {},
      dirty: {},
      binaryPaths: {},
      buildLog: [],
      lastBuildSuccess: null,
      welcomeAction: "none",
    });
    get().detectLatex();
    // Persist as last project (best effort).
    const current = get().appSettings;
    const next: AppSettings = {
      lastProject: root,
      recentProjects: [root, ...current.recentProjects.filter((p) => p !== root)].slice(0, 10),
    };
    set({ appSettings: next });
    api.saveAppSettings(next).catch(() => undefined);
    // Open the main file if present.
    try {
      await get().openFile(settings.mainFile);
    } catch {
      /* main file missing: leave tabs empty */
    }
  },

  openProjectFolder: async () => {
    const picked = await api.selectProjectFolder();
    if (picked) await get().setRoot(picked);
  },

  refreshTree: async () => {
    const root = get().rootPath;
    if (!root) return;
    try {
      const tree = await api.readFileTree(root);
      set({ tree });
    } catch {
      /* ignore */
    }
  },

  openFile: async (path) => {
    const root = get().rootPath;
    if (!root) return;
    const existing = get().tabs.find((t) => t.path === path);
    if (existing) {
      set({ activeTab: path });
      return;
    }
    const fc = await api.readFile(root, path);
    set((s) => ({
      tabs: [...s.tabs, { path }],
      activeTab: path,
      buffers: { ...s.buffers, [path]: fc.content },
      dirty: { ...s.dirty, [path]: false },
      binaryPaths: fc.binary ? { ...s.binaryPaths, [path]: true } : s.binaryPaths,
    }));
  },

  closeTab: (path) => {
    // A tab closed within the debounce window must not be autosaved anyway:
    // cancel the pending timer before dropping the tab.
    clearPendingAutosave(path);
    set((s) => {
      const tabs = s.tabs.filter((t) => t.path !== path);
      let activeTab = s.activeTab;
      if (activeTab === path) {
        const idx = s.tabs.findIndex((t) => t.path === path);
        activeTab = tabs[Math.min(idx, tabs.length - 1)]?.path ?? null;
      }
      return { tabs, activeTab };
    });
  },

  setActiveTab: (path) => set({ activeTab: path }),

  updateBuffer: (path, content) => {
    // Files flagged non-modifiable (binary or non UTF-8) are shown read-only
    // in the editor: never buffer their content and never schedule an
    // autosave for them. This is an explicit guard, not a side effect of
    // the read-only editor state: the backend never returns lossy text for
    // these files, and any write here could corrupt the file on disk.
    if (get().binaryPaths[path]) return;
    set((s) => ({
      buffers: { ...s.buffers, [path]: content },
      dirty: { ...s.dirty, [path]: true },
    }));
    const { settings, rootPath } = get();
    if (!settings.autoSave || !rootPath) return;
    const prev = autosaveTimers.get(path);
    if (prev) clearTimeout(prev);
    autosaveTimers.set(
      path,
      setTimeout(() => {
        autosaveTimers.delete(path);
        get().saveFile(path);
      }, 1200),
    );
  },

  saveFile: async (path) => {
    const { rootPath, buffers } = get();
    if (!rootPath) return;
    const content = buffers[path];
    if (content === undefined) return;
    try {
      await api.writeFile(rootPath, path, content);
      set((s) => ({ dirty: { ...s.dirty, [path]: false } }));
      const { settings } = get();
      if (settings.autoBuild && path === settings.mainFile) {
        get().build();
      }
    } catch (e) {
      get().appendLog({
        tsMs: Date.now(),
        kind: "error",
        file: null,
        line: null,
        text: `salvataggio fallito (${path}): ${String(e)}`,
      });
    }
  },

  jumpTo: async (file, line) => {
    const { rootPath } = get();
    if (!rootPath) return;
    const rel = relToRoot(file, rootPath);
    if (!rel) return;
    try {
      if (!get().tabs.find((t) => t.path === rel)) {
        await get().openFile(rel);
      } else {
        set({ activeTab: rel });
      }
      set((s) => ({
        pendingJump: { path: rel, line, nonce: (s.pendingJump?.nonce ?? 0) + 1 },
      }));
    } catch {
      /* file cannot be opened */
    }
  },

  createProjectFromTemplate: async (templateId, projectName) => {
    const tpl = TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) throw new Error("template sconosciuto");
    const name = projectName.trim();
    if (!name) throw new Error("inserisci un nome per il progetto");
    const parent = await api.selectProjectFolder();
    if (!parent) return;
    const root = `${parent.replace(/[\\/]+$/, "")}/${name}`;
    await api.createItem(parent, "", name, "dir");
    for (const f of tpl.files) {
      await api.writeFile(root, f.path, f.content);
    }
    await get().setRoot(root);
  },

  createItem: async (parent, name, kind) => {
    const root = get().rootPath;
    if (!root) return;
    await api.createItem(root, parent, name, kind);
    await get().refreshTree();
    if (kind === "file") {
      const path = parent ? `${parent}/${name}` : name;
      // If the configured main file does not exist yet, adopt the first
      // .tex file the user creates, so compiling a brand-new document
      // works without a trip to the settings dialog.
      if (/\.tex$/i.test(name)) {
        const { settings } = get();
        try {
          await api.readFile(root, settings.mainFile);
        } catch {
          await get().updateSettings({ mainFile: path });
        }
      }
      try {
        await get().openFile(path);
      } catch {
        /* ignore */
      }
    }
  },

  renameItem: async (path, newName) => {
    const root = get().rootPath;
    if (!root) return;
    await api.renameItem(root, path, newName);
    // The delayed autosave timer of the old path must be cancelled BEFORE
    // closing the tab: firing after the rename it would rewrite the buffer
    // under the OLD name, recreating the file just renamed. Buffer and
    // dirty flag of the old path go too — openFile recreates them reading
    // the renamed file from disk.
    clearPendingAutosave(path);
    set((s) => {
      const buffers = { ...s.buffers };
      delete buffers[path];
      const dirty = { ...s.dirty };
      delete dirty[path];
      return { buffers, dirty };
    });
    // If an open tab pointed at the old path, close it.
    get().closeTab(path);
    await get().refreshTree();
  },

  deleteItem: async (path) => {
    const root = get().rootPath;
    if (!root) return;
    await api.deleteItem(root, path);
    get().closeTab(path);
    await get().refreshTree();
  },

  updateSettings: async (patch) => {
    const { rootPath, settings } = get();
    const next = { ...settings, ...patch };
    set({ settings: next });
    if (rootPath) {
      try {
        await api.saveProjectSettings(rootPath, next);
      } catch {
        /* best effort */
      }
    }
  },

  detectLatex: async () => {
    try {
      const latex = await api.detectLatex();
      set({ latex });
    } catch {
      set({ latex: null });
    }
  },

  build: async () => {
    const { rootPath, settings, buildRunning } = get();
    if (!rootPath || buildRunning) return;
    set({ buildLog: [], buildRunning: true, lastBuildSuccess: null, outputOpen: true });
    try {
      await api.startBuild(rootPath, settings.mainFile, settings.engine, settings.shellEscape);
    } catch (e) {
      set({ buildRunning: false });
      // M0.7.1 — l'esito tipizzato del gate backend (distribuzione assente
      // o motore mancante) apre il DIALOG di guida; ogni altro errore resta
      // una riga di log, come ha sempre fatto l'app.
      const described = describeBuildStartError(e);
      if (described.kind === "toolchain") {
        set({ buildDialog: { title: described.title, body: described.body } });
      } else {
        get().appendLog({
          tsMs: Date.now(),
          kind: "error",
          file: null,
          line: null,
          text: described.text,
        });
      }
    }
  },

  closeBuildDialog: () => set({ buildDialog: null }),

  cancelBuild: async () => {
    try {
      await api.cancelBuild();
    } catch {
      /* ignore */
    }
  },

  appendLog: (line) => {
    set((s) => ({
      buildLog: [...s.buildLog, line].slice(-3000),
    }));
  },

  clearLog: () => set({ buildLog: [] }),

  setBuildFinished: (payload) => {
    set((s) => ({
      buildRunning: false,
      lastBuildSuccess: payload.success,
      lastBuildDurationMs: payload.durationMs,
      pdfVersion: payload.success ? s.pdfVersion + 1 : s.pdfVersion,
    }));
  },

  toggleOutput: () => set((s) => ({ outputOpen: !s.outputOpen })),
  togglePdf: () => set((s) => ({ pdfOpen: !s.pdfOpen })),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setWelcomeAction: (a) => set({ welcomeAction: a }),
  setSelectedTemplateId: (id) => set({ selectedTemplateId: id }),

  // ---- aggiornamenti (MU.3): tutto parte da un click, mai da sola ----

  checkForUpdates: async () => {
    const phase = get().update.phase;
    if (phase === "checking" || phase === "downloading") return;
    set({ update: { phase: "checking" } });
    try {
      const found = await get().updaterPort.check();
      updateHandle = found;
      if (!found) {
        set({ update: { phase: "up-to-date" } });
      } else {
        set({
          update: {
            phase: "available",
            version: found.version,
            notes: found.notes,
          },
        });
      }
    } catch (e) {
      const m = mapUpdaterError(e, "check");
      set({ update: { phase: "error", message: m.title, detail: m.detail } });
    }
  },

  downloadUpdate: async () => {
    const st = get().update;
    if (st.phase !== "available" || !updateHandle) return;
    const version = st.version;
    set({ update: { phase: "downloading", version, received: 0, total: null } });
    try {
      await updateHandle.download((p) => {
        set((s) =>
          s.update.phase === "downloading"
            ? {
                update: {
                  phase: "downloading",
                  version,
                  received: p.received,
                  total: p.total,
                },
              }
            : {},
        );
      });
      set({ update: { phase: "ready", version } });
    } catch (e) {
      const m = mapUpdaterError(e, "download");
      set({ update: { phase: "error", message: m.title, detail: m.detail } });
    }
  },

  installUpdate: async () => {
    const st = get().update;
    if (st.phase !== "ready" || !updateHandle) return;
    // Su Windows l'installer chiude l'app appena parte l'installazione:
    // PRIMA di installare si salvano su disco TUTTI i buffer sporchi,
    // l'aggiornamento non deve mai costare dati non salvati. Se anche un
    // solo file resta sporco l'installazione NON parte.
    await get().saveAllDirty();
    const stillDirty = Object.keys(get().dirty).filter((p) => get().dirty[p]);
    if (stillDirty.length > 0) {
      set({
        update: {
          phase: "error",
          message: `impossibile salvare ${stillDirty.length} file prima dell'installazione (${stillDirty.join(", ")}): aggiornamento non installato`,
          detail: null,
        },
      });
      return;
    }
    try {
      await updateHandle.install();
      await get().updaterPort.relaunch();
    } catch (e) {
      const m = mapUpdaterError(e, "install");
      set({ update: { phase: "error", message: m.title, detail: m.detail } });
    }
  },

  resetUpdateUi: () => {
    updateHandle = null;
    set({ update: { phase: "idle" } });
  },

  saveAllDirty: async () => {
    const { rootPath, dirty, buffers, binaryPaths } = get();
    if (!rootPath) return;
    for (const path of Object.keys(dirty)) {
      if (!dirty[path]) continue;
      // I file non modificabili non si toccano mai; i buffer assenti nemmeno.
      if (binaryPaths[path]) continue;
      if (buffers[path] === undefined) continue;
      // Il timer di autosave pendente va cancellato: la sua scrittura in
      // differita arriverebbe dopo l'uscita dell'app.
      clearPendingAutosave(path);
      await get().saveFile(path);
    }
  },
}));

/**
 * Livello IPC tipizzato: UNICO punto di contatto tra frontend e backend Rust.
 * I tipi rispecchiano le struct Rust (serde rename_all = camelCase).
 */
import { invoke } from '@tauri-apps/api/core';
import type { UnlistenFn } from '@tauri-apps/api/event';

// ---------------------------------------------------------------------------
// Tipi condivisi con Rust
// ---------------------------------------------------------------------------

export type EngineId = 'pdflatex' | 'xelatex' | 'lualatex';

export interface FileNode {
  name: string;
  /** Percorso relativo alla radice progetto, separatori '/'. */
  path: string;
  kind: 'dir' | 'file';
  children?: FileNode[];
}

export interface FileStat {
  exists: boolean;
  mtimeMs: number;
  size: number;
}

export interface FileContent {
  text: string;
  stat: FileStat;
}

export interface ProjectLocalSettings {
  /** undefined = usa il valore globale. */
  autosave?: boolean | null;
  autosaveDelayMs?: number | null;
  editorFontSize?: number | null;
  wordWrap?: boolean | null;
  warnShellEscape?: boolean | null;
}

export interface ProjectMeta {
  name: string;
  mainFile: string;
  engine: EngineId;
  useLatexmk: boolean;
  outputDir: string;
  settings: ProjectLocalSettings;
  createdAt: number;
  updatedAt: number;
}

export interface GlobalSettings {
  latexBinDir: string | null;
  defaultEngine: EngineId;
  autosave: boolean;
  autosaveDelayMs: number;
  editorFontSize: number;
  wordWrap: boolean;
  theme: 'dark' | 'light';
  warnShellEscape: boolean;
  allowShellEscape: boolean;
  recentProjects: string[];
}

export interface ToolInfo {
  path: string;
  version: string | null;
}

export interface LatexInfo {
  engines: Record<string, ToolInfo | null>;
}

export type IssueSeverity = 'error' | 'warning';

export interface Issue {
  severity: IssueSeverity;
  /** Percorso relativo al progetto, se noto. */
  file: string | null;
  line: number | null;
  message: string;
  source: string | null;
}

export interface LabelEntry {
  name: string;
  file: string;
  line: number;
}

export interface BibEntry {
  key: string;
  file: string;
  line: number;
}

export interface LabelsIndex {
  labels: LabelEntry[];
  bibKeys: BibEntry[];
}

export interface ProjectSnapshot {
  root: string;
  meta: ProjectMeta;
  tree: FileNode;
}

export interface BuildRequest {
  mainFile: string;
  engine: EngineId;
  useLatexmk: boolean;
  outputDir: string;
  allowShellEscape: boolean;
  latexBinDir: string | null;
}

export interface BuildOutputEvent {
  buildId: number;
  stream: 'stdout' | 'stderr';
  text: string;
}

export interface BuildStatusEvent {
  buildId: number;
  kind: 'started' | 'step' | 'finished' | 'cancelled';
  step?: string | null;
  success?: boolean | null;
  issues?: Issue[] | null;
  pdfPath?: string | null;
  pdfRel?: string | null;
  durationMs?: number | null;
  error?: string | null;
}

// ---------------------------------------------------------------------------
// Wrapper tipizzati dei comandi Tauri
// ---------------------------------------------------------------------------

export const ipc = {
  openProject: (path: string) => invoke<ProjectSnapshot>('open_project', { path }),
  createProject: (parentDir: string, name: string, template: string) =>
    invoke<ProjectSnapshot>('create_project', { parentDir, name, template }),
  readFileTree: () => invoke<FileNode>('read_file_tree'),
  readFile: (path: string) => invoke<FileContent>('read_file', { path }),
  writeFile: (path: string, content: string) => invoke<FileStat>('write_file', { path, content }),
  createEntry: (path: string, isDir: boolean) => invoke<void>('create_entry', { path, isDir }),
  renameEntry: (from: string, to: string) => invoke<void>('rename_entry', { from, to }),
  deleteEntry: (path: string) => invoke<void>('delete_entry', { path }),
  fileStat: (path: string) => invoke<FileStat>('file_stat', { path }),
  collectLabels: () => invoke<LabelsIndex>('collect_labels'),
  /** Ritorna i byte del PDF in base64. */
  readPdf: (path: string) => invoke<string>('read_pdf', { path }),
  detectLatex: (binDir: string | null) => invoke<LatexInfo>('detect_latex', { binDir }),
  startBuild: (req: BuildRequest) => invoke<{ buildId: number }>('start_build', { req }),
  cancelBuild: () => invoke<void>('cancel_build'),
  readGlobalSettings: () => invoke<GlobalSettings>('read_global_settings'),
  writeGlobalSettings: (settings: GlobalSettings) =>
    invoke<void>('write_global_settings', { settings }),
  readProjectSettings: () => invoke<ProjectMeta>('read_project_settings'),
  writeProjectSettings: (meta: ProjectMeta) => invoke<ProjectMeta>('write_project_settings', { meta }),
} as const;

export type Ipc = typeof ipc;
export type { UnlistenFn };

/** Estrae un messaggio leggibile da un errore invoke (o da qualunque errore). */
export function errMsg(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string' && m.length > 0) return m;
  }
  if (typeof e === 'string' && e.length > 0) return e;
  return 'errore sconosciuto';
}

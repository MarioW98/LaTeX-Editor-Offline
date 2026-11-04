// Shared types mirroring the Rust serialization (camelCase).

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  children: FileEntry[] | null;
}

export interface FileStat {
  mtimeMs: number;
  size: number;
}

export interface EngineInfo {
  name: string;
  path: string;
  version: string;
}

export interface LatexReport {
  found: boolean;
  engines: EngineInfo[];
  latexmkPath: string | null;
  bibtexPath: string | null;
  biberPath: string | null;
  distribution: string | null;
}

export interface GlobalSettings {
  theme: "dark" | "light";
  fontSize: number;
  wordWrap: boolean;
  defaultEngine: string;
  autosaveEnabled: boolean;
  autosaveDelayMs: number;
  latexPathOverride: string | null;
  recentProjects: string[];
}

export interface ProjectSettings {
  mainFile: string;
  engine: string;
  outputDir: string;
  useLatexmk: boolean;
  shellEscape: boolean;
}

export interface ProjectInfo {
  root: string;
  name: string;
  tree: FileEntry[];
  settings: ProjectSettings;
  hasProjectJson: boolean;
}

export interface LogIssue {
  kind: "error" | "warning";
  file: string | null;
  line: number | null;
  message: string;
}

export interface BuildLineEvent {
  buildId: number;
  stream: string;
  text: string;
}

export type BuildStatus = "idle" | "running" | "success" | "error" | "cancelled";

export interface BuildFinishedEvent {
  buildId: number;
  status: BuildStatus;
  issues: LogIssue[];
  pdfPath: string | null;
  durationMs: number;
  message: string | null;
}

export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  files: string[];
}

export interface StartBuildParams {
  projectRoot: string;
  mainFile: string;
  engine: string;
  outputDir: string;
  useLatexmk: boolean;
  shellEscape: boolean;
}

export type ThemeName = "dark" | "light";

export interface FileNode {
  name: string;
  path: string;
  kind: "file" | "dir";
  children?: FileNode[] | null;
}

export interface FileContent {
  content: string;
  size: number;
  binary: boolean;
}

export interface ToolInfo {
  name: string;
  available: boolean;
  version: string;
}

export interface LatexStatus {
  tools: ToolInfo[];
  latexmkAvailable: boolean;
}

export type LogKind = "info" | "error" | "warning" | "stdout" | "stderr";

export interface LogLine {
  tsMs: number;
  kind: LogKind;
  file: string | null;
  line: number | null;
  text: string;
}

export interface BuildFinishedPayload {
  success: boolean;
  cancelled: boolean;
  durationMs: number;
  pdfPath: string | null;
}

export type Engine = "pdflatex" | "xelatex" | "lualatex";

export interface ProjectSettings {
  mainFile: string;
  engine: Engine;
  shellEscape: boolean;
  autoSave: boolean;
  autoBuild: boolean;
  fontSize: number;
}

export interface AppSettings {
  lastProject: string | null;
  recentProjects: string[];
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  mainFile: "main.tex",
  engine: "pdflatex",
  shellEscape: false,
  autoSave: true,
  autoBuild: false,
  fontSize: 13.5,
};

// Typed IPC layer: every Tauri command invocation and event subscription of
// the app passes through this module. No `any`, no scattered invoke calls.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open as dialogOpen } from "@tauri-apps/plugin-dialog";

import type {
  BuildFinishedEvent,
  BuildLineEvent,
  FileEntry,
  FileStat,
  GlobalSettings,
  LatexReport,
  ProjectInfo,
  ProjectSettings,
  StartBuildParams,
  TemplateInfo,
} from "../types";

export const EVENTS = {
  output: "build://output",
  finished: "build://finished",
} as const;

// ---------------------------------------------------------------- dialogs --

export async function pickFolder(title: string): Promise<string | null> {
  const res = await dialogOpen({ directory: true, multiple: false, title });
  return typeof res === "string" ? res : null;
}

// ---------------------------------------------------------------- project --

export const openProject = (root: string): Promise<ProjectInfo> =>
  invoke<ProjectInfo>("open_project", { root });

export const readTree = (projectRoot: string): Promise<FileEntry[]> =>
  invoke<FileEntry[]>("read_file_tree", { projectRoot });

// ------------------------------------------------------------------- files --

export const readFile = (projectRoot: string, path: string): Promise<string> =>
  invoke<string>("read_file", { projectRoot, path });

export const writeFile = (
  projectRoot: string,
  path: string,
  contents: string
): Promise<FileStat> => invoke<FileStat>("write_file", { projectRoot, path, contents });

export const createEntry = (
  projectRoot: string,
  path: string,
  isDir: boolean
): Promise<void> => invoke<void>("create_entry", { projectRoot, path, isDir });

export const renameEntry = (
  projectRoot: string,
  oldPath: string,
  newPath: string
): Promise<void> => invoke<void>("rename_entry", { projectRoot, oldPath, newPath });

export const deleteEntry = (projectRoot: string, path: string): Promise<void> =>
  invoke<void>("delete_entry", { projectRoot, path });

export const statFile = (projectRoot: string, path: string): Promise<FileStat> =>
  invoke<FileStat>("stat_file", { projectRoot, path });

export const readPdfBytes = (projectRoot: string, path: string): Promise<ArrayBuffer> =>
  invoke<ArrayBuffer>("read_pdf_bytes", { projectRoot, path });

// --------------------------------------------------------------- settings --

export const getGlobalSettings = (): Promise<GlobalSettings> =>
  invoke<GlobalSettings>("get_global_settings");

export const saveGlobalSettings = (settings: GlobalSettings): Promise<void> =>
  invoke<void>("save_global_settings", { settings });

export const getProjectSettings = (projectRoot: string): Promise<ProjectSettings> =>
  invoke<ProjectSettings>("get_project_settings", { projectRoot });

export const saveProjectSettings = (
  projectRoot: string,
  settings: ProjectSettings
): Promise<ProjectSettings> =>
  invoke<ProjectSettings>("save_project_settings", { projectRoot, settings });

// ------------------------------------------------------------------- latex --

export const detectLatex = (): Promise<LatexReport> =>
  invoke<LatexReport>("detect_latex_installation");

// ------------------------------------------------------------------ build --

export const startBuild = (params: StartBuildParams): Promise<number> =>
  invoke<number>("start_build", { params });

export const cancelBuild = (buildId: number): Promise<void> =>
  invoke<void>("cancel_build", { buildId });

export const readBuildOutput = (buildId: number): Promise<string> =>
  invoke<string>("read_build_output", { buildId });

/** Shape of the Rust `PdfPathResult` return value. */
interface PdfPathResult {
  path: string | null;
}

export const getBuiltPdfPath = (
  projectRoot: string,
  mainFile: string,
  outputDir: string
): Promise<string | null> =>
  invoke<PdfPathResult>("get_built_pdf_path", { projectRoot, mainFile, outputDir }).then(
    (r) => r.path
  );

// -------------------------------------------------------------- templates --

export const listTemplates = (): Promise<TemplateInfo[]> =>
  invoke<TemplateInfo[]>("list_templates");

export const createProjectFromTemplate = (
  templateId: string,
  parentDir: string,
  projectName: string
): Promise<string> =>
  invoke<string>("create_project_from_template", { templateId, parentDir, projectName });

// ------------------------------------------------------------------ events --

export function onBuildLine(handler: (ev: BuildLineEvent) => void): Promise<UnlistenFn> {
  return listen<BuildLineEvent>(EVENTS.output, (e) => handler(e.payload));
}

export function onBuildFinished(handler: (ev: BuildFinishedEvent) => void): Promise<UnlistenFn> {
  return listen<BuildFinishedEvent>(EVENTS.finished, (e) => handler(e.payload));
}

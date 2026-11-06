import { invoke } from "@tauri-apps/api/core";
import type {
  AppSettings,
  Engine,
  FileContent,
  FileNode,
  LatexStatus,
  LogLine,
  ProjectSettings,
} from "./types.ts";

/**
 * Thin, fully typed wrapper around the 16 Tauri commands.
 * All file system access goes through these calls: the webview never
 * touches the disk directly, and the Rust side validates every path
 * against the selected project folder.
 */
export const api = {
  selectProjectFolder: () => invoke<string | null>("select_project_folder"),

  readFileTree: (root: string) => invoke<FileNode[]>("read_file_tree", { root }),

  readFile: (root: string, path: string) =>
    invoke<FileContent>("read_file", { root, path }),

  writeFile: (root: string, path: string, content: string) =>
    invoke<void>("write_file", { root, path, content }),

  createItem: (root: string, parent: string, name: string, kind: "file" | "dir") =>
    invoke<void>("create_item", { root, parent, name, kind }),

  renameItem: (root: string, path: string, newName: string) =>
    invoke<void>("rename_item", { root, path, newName }),

  deleteItem: (root: string, path: string) =>
    invoke<void>("delete_item", { root, path }),

  detectLatex: () => invoke<LatexStatus>("detect_latex"),

  startBuild: (
    root: string,
    mainFile: string,
    engine: Engine,
    shellEscape: boolean,
  ) => invoke<void>("start_build", { root, mainFile, engine, shellEscape }),

  cancelBuild: () => invoke<boolean>("cancel_build"),

  readBuildLog: () => invoke<LogLine[]>("read_build_log"),

  readPdfBytes: (root: string, mainFile: string) =>
    invoke<ArrayBuffer>("read_pdf_bytes", { root, mainFile }),

  getProjectSettings: (root: string) =>
    invoke<ProjectSettings>("get_project_settings", { root }),

  saveProjectSettings: (root: string, settings: ProjectSettings) =>
    invoke<void>("save_project_settings", { root, settings }),

  getAppSettings: () => invoke<AppSettings>("get_app_settings"),

  saveAppSettings: (settings: AppSettings) =>
    invoke<void>("save_app_settings", { settings }),
};

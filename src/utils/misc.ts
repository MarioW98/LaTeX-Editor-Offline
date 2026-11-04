// Small generic helpers.

import type { FileEntry } from "../types";

export function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter((p) => p.length > 0);
  return parts.length > 0 ? parts[parts.length - 1] : path;
}

export function dirname(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx > 0 ? path.slice(0, idx) : "";
}

export function extname(path: string): string {
  const base = basename(path);
  const idx = base.lastIndexOf(".");
  return idx > 0 ? base.slice(idx + 1).toLowerCase() : "";
}

export function joinPath(dir: string, name: string): string {
  if (dir.length === 0) return name;
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  return dir.endsWith("/") || dir.endsWith("\\") ? `${dir}${name}` : `${dir}${sep}${name}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${Math.round(s - m * 60)} s`;
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeRelPath(p: string): string {
  let out = p.replace(/\\/g, "/");
  while (out.startsWith("./")) out = out.slice(2);
  return out;
}

export function isAbsoluteLike(p: string): boolean {
  return p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p);
}

/** Flatten a file tree into a list of file entries (files only). */
export function flattenFiles(tree: FileEntry[]): FileEntry[] {
  const out: FileEntry[] = [];
  const walk = (nodes: FileEntry[]): void => {
    for (const n of nodes) {
      if (n.isDir) {
        if (n.children) walk(n.children);
      } else {
        out.push(n);
      }
    }
  };
  walk(tree);
  return out;
}

/** Collect all `\label{...}` ids defined in the given document text. */
export function collectLabels(content: string): string[] {
  const re = /\\label\{([^}]*)\}/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/** Collect BibTeX entry keys (`@article{key,`) from the given text. */
export function collectBibKeys(content: string): string[] {
  const re = /@(?:article|book|inproceedings|incollection|phdthesis|mastersthesis|techreport|unpublished|misc|manual|online|electronic|www|proceedings|inbook|booklet|conference)\s*\{\s*([^,\s}]+)/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

export function timeHHMM(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

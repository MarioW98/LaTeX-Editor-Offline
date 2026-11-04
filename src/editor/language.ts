// Language selection by file extension.

import { markdown } from "@codemirror/lang-markdown";
import { StreamLanguage } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import type { Extension } from "@codemirror/state";

import { extname } from "../utils/misc";

const LATEX_LIKE = ["tex", "sty", "cls", "bib", "dtx", "ltx", "clo", "cfg", "fd", "def"];

export function isLatexLike(path: string): boolean {
  return LATEX_LIKE.includes(extname(path));
}

export function languageExtensionsFor(path: string): Extension[] {
  const ext = extname(path);
  if (LATEX_LIKE.includes(ext)) {
    return [StreamLanguage.define(stex)];
  }
  if (ext === "md" || ext === "markdown") {
    return [markdown()];
  }
  return [];
}

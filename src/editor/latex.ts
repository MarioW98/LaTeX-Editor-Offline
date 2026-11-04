import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

/**
 * Original, minimal LaTeX tokenizer for CodeMirror 6 based on StreamLanguage.
 * Covers comments, commands, math groups, brackets and numbers: enough for
 * comfortable editing without pulling external grammar packages.
 */
function latexToken(stream: { // StringStream (structural subset)
  eat: (m: string | RegExp) => boolean | string[];
  match: (m: string | RegExp) => boolean | string[];
  next: () => string | null;
  peek: () => string | null;
  skipToEnd: () => void;
  eol: () => boolean;
}): string | null {
  // comments: % to end of line (escaped \% handled by the fallback)
  if (stream.peek() === "%") {
    stream.skipToEnd();
    return "comment";
  }
  // commands: \word, \word*, \@word, single-char commands like \\ or \{
  if (stream.match(/\\[a-zA-Z@]+\*?/)) return "keyword";
  if (stream.match(/\\[^a-zA-Z]/)) return "keyword";
  // math groups: $...$ or $$...$$
  if (stream.peek() === "$") {
    stream.next();
    let closed = false;
    while (!stream.eol()) {
      const c = stream.next();
      if (c === "$") {
        closed = true;
        break;
      }
      if (c === "\\") stream.next();
    }
    void closed;
    return "string";
  }
  // inline \begin{env} braces content
  if (stream.match(/\{[^{}]*\}/)) return "meta";
  if (stream.match(/[{}]/)) return "punctuation";
  if (stream.match(/[\[\]]/)) return "punctuation";
  if (stream.match(/\d+(\.\d+)?/)) return "number";
  stream.next();
  return null;
}

export const latexLanguage = StreamLanguage.define({
  name: "latex",
  token: latexToken as never,
});

export const latexHighlighting = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.comment, color: "#7b8296", fontStyle: "italic" },
    { tag: t.keyword, color: "#7cc7ff" },
    { tag: t.string, color: "#e0b34c" },
    { tag: t.meta, color: "#9fd89f" },
    { tag: t.number, color: "#f0a472" },
    { tag: t.punctuation, color: "#a8aec2" },
  ]),
);

export const editorTheme = (fontSize: number) =>
  EditorView.theme(
    {
      "&": { color: "#d7dae0", backgroundColor: "#1b1d23", fontSize: `${fontSize}px` },
      ".cm-content": { caretColor: "#5aa2f7", fontFamily: "'Cascadia Code', 'JetBrains Mono', Consolas, 'DejaVu Sans Mono', monospace" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#5aa2f7" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: "#2d3a4f",
      },
      ".cm-activeLine": { backgroundColor: "#21242c" },
      ".cm-gutters": { backgroundColor: "#1b1d23", color: "#5b6070", border: "none" },
      ".cm-activeLineGutter": { backgroundColor: "#21242c", color: "#9aa0b0" },
      ".cm-selectionMatch": { backgroundColor: "#31445f" },
      ".cm-tooltip": { backgroundColor: "#24262e", border: "1px solid #2e313a" },
    },
    { dark: true },
  );

/** Common completions for the \ commands. */
const COMMANDS = [
  "documentclass", "usepackage", "title", "author", "date", "maketitle",
  "begin", "end", "section", "subsection", "subsubsection", "paragraph",
  "textbf", "textit", "emph", "underline", "footnote", "cite", "label",
  "ref", "eqref", "item", "includegraphics", "bibliography", "bibliographystyle",
  "input", "include", "tableofcontents", "newcommand", "renewcommand",
];

function latexCompletions(context: {
  matchBefore: (expr: RegExp) => { from: number; to: number; text: string } | null;
}): {
  from: number;
  options: Array<{ label: string; type: string }>;
} | null {
  const before = context.matchBefore(/\\[a-zA-Z@]*/);
  if (!before) return null;
  return {
    from: before.from,
    options: COMMANDS.map((c) => ({ label: `\\${c}`, type: "keyword" })),
  };
}

export const latexAutocompletion = {
  override: [latexCompletions as never],
};

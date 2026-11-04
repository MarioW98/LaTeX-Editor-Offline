// CodeMirror 6 host component.
//
// - one EditorView for the whole app; per-tab EditorState cached in a Map;
// - content flows INTO CodeMirror on tab switch / external reload only;
// - user edits flow OUT to the store through the update listener
//   (the store is the single source of truth for saving);
// - Ctrl/Cmd+S saves the active tab; Ctrl/Cmd+D adds a multi-cursor;
// - clicking a `\ref{...}` jumps to the matching `\label{...}`;
// - theme / font size / word wrap are controlled by Compartments.

import { useEffect, useRef } from "react";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  bracketMatching,
  defaultHighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import { highlightSelectionMatches, search, searchKeymap, selectNextOccurrence } from "@codemirror/search";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";

import { useAppStore } from "../state/store";
import { latexCompletionSource } from "./completions";
import { languageExtensionsFor } from "./language";

// Compartments are module-level: a single editor instance exists per window.
const langComp = new Compartment();
const themeComp = new Compartment();
const wrapComp = new Compartment();
const fontComp = new Compartment();

const lightThemeExt: Extension = EditorView.theme(
  {
    "&": { color: "#26303d", backgroundColor: "#ffffff" },
    ".cm-content": { caretColor: "#0d9488" },
    "&.cm-focused .cm-cursor": { borderLeftColor: "#0d9488" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, &.cm-editor ::selection":
      { backgroundColor: "rgba(13, 148, 136, 0.18)" },
    ".cm-activeLine": { backgroundColor: "rgba(13, 148, 136, 0.06)" },
  },
  { dark: false }
);

function themeExtensions(): Extension[] {
  const dark = useAppStore.getState().globalSettings.theme === "dark";
  return dark ? [oneDark] : [lightThemeExt, syntaxHighlighting(defaultHighlightStyle)];
}

function wrapExtensions(): Extension[] {
  return useAppStore.getState().globalSettings.wordWrap ? [EditorView.lineWrapping] : [];
}

function fontExtensions(): Extension[] {
  const size = useAppStore.getState().globalSettings.fontSize;
  return [EditorView.theme({ "&": { fontSize: `${size}px` } })];
}

const updateListener = EditorView.updateListener.of((update) => {
  const state = useAppStore.getState();
  const path = state.activeTabPath;
  if (update.docChanged && path) {
    state.setTabContent(path, update.state.doc.toString());
  }
  if (update.selectionSet) {
    const head = update.state.selection.main.head;
    const line = update.state.doc.lineAt(head);
    state.setCursor(line.number, head - line.from + 1);
  }
});

const clickHandler = (event: MouseEvent, view: EditorView): boolean => {
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos == null) return false;
  const line = view.state.doc.lineAt(pos);
  const offset = pos - line.from;
  const re = /\\(?:ref|eqref|pageref|autoref|nameref)\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line.text)) !== null) {
    if (offset >= m.index && offset <= m.index + m[0].length) {
      void useAppStore.getState().jumpToLabel(m[1]);
      return true;
    }
  }
  return false;
};

function baseExtensions(langExt: Extension[]): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    rectangularSelection(),
    EditorState.allowMultipleSelections.of(true),
    bracketMatching(),
    closeBrackets(),
    autocompletion({ override: [latexCompletionSource], icons: true }),
    highlightSelectionMatches(),
    search({ top: true }),
    keymap.of([
      {
        key: "Mod-s",
        run: () => {
          void useAppStore.getState().saveActiveTab();
          return true;
        },
        preventDefault: true,
      },
      { key: "Mod-d", run: selectNextOccurrence },
      {
        key: "Mod-F9",
        run: () => {
          void useAppStore.getState().startBuild();
          return true;
        },
      },
      indentWithTab,
      ...closeBracketsKeymap,
      ...completionKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...defaultKeymap,
    ]),
    langComp.of(langExt),
    themeComp.of(themeExtensions()),
    wrapComp.of(wrapExtensions()),
    fontComp.of(fontExtensions()),
    updateListener,
    EditorView.domEventHandlers({ click: clickHandler }),
  ];
}

function makeState(content: string, path: string): EditorState {
  return EditorState.create({ doc: content, extensions: baseExtensions(languageExtensionsFor(path)) });
}

const emptyState = (): EditorState => EditorState.create({ doc: "", extensions: baseExtensions([]) });

export function CodeEditor(): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const statesRef = useRef(new Map<string, EditorState>());
  const tokensRef = useRef(new Map<string, number>());
  const prevPathRef = useRef<string | null>(null);

  const activePath = useAppStore((s) => s.activeTabPath);
  const reloadToken = useAppStore(
    (s) => s.tabs.find((t) => t.path === s.activeTabPath)?.reloadToken ?? 0
  );
  const theme = useAppStore((s) => s.globalSettings.theme);
  const fontSize = useAppStore((s) => s.globalSettings.fontSize);
  const wordWrap = useAppStore((s) => s.globalSettings.wordWrap);
  const pendingReveal = useAppStore((s) => s.pendingReveal);

  // ---- mount / unmount the view -------------------------------------------
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const view = new EditorView({ parent: host, state: emptyState() });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
      statesRef.current.clear();
      tokensRef.current.clear();
    };
  }, []);

  // ---- swap document on tab change / external reload ----------------------
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    // preserve the live state of the previously active tab
    const prev = prevPathRef.current;
    if (prev && prev !== activePath) {
      statesRef.current.set(prev, view.state);
    }
    prevPathRef.current = activePath;

    if (!activePath) {
      view.setState(emptyState());
      return;
    }
    const tab = useAppStore.getState().tabs.find((t) => t.path === activePath);
    if (!tab) return;

    const cached = statesRef.current.get(activePath);
    const cachedToken = tokensRef.current.get(activePath);
    if (cached !== undefined && cachedToken === tab.reloadToken) {
      view.setState(cached);
    } else {
      const st = makeState(tab.content, activePath);
      statesRef.current.set(activePath, st);
      tokensRef.current.set(activePath, tab.reloadToken);
      view.setState(st);
    }
  }, [activePath, reloadToken]);

  // ---- live settings through compartments ---------------------------------
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        themeComp.reconfigure(themeExtensions()),
        wrapComp.reconfigure(wordWrap ? [EditorView.lineWrapping] : []),
        fontComp.reconfigure([EditorView.theme({ "&": { fontSize: `${fontSize}px` } })]),
      ],
    });
  }, [theme, fontSize, wordWrap, activePath, reloadToken]);

  // ---- reveal a requested line (problems list / label jumps) --------------
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !pendingReveal) return;
    if (pendingReveal.path !== useAppStore.getState().activeTabPath) return;
    const total = view.state.doc.lines;
    const lineNo = Math.min(Math.max(1, pendingReveal.line), total);
    const line = view.state.doc.line(lineNo);
    view.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: "center" }),
    });
    view.focus();
  }, [pendingReveal, activePath, reloadToken]);

  return (
    <>
      <div
        ref={hostRef}
        style={{ height: "100%", display: activePath ? "block" : "none" }}
        aria-label="Editor"
      />
      {!activePath && (
        <div className="editor-empty">
          <div>
            Apri un file dall&apos;albero a sinistra per iniziare a modificare.
            <br />
            <span style={{ fontSize: 12 }}>
              Suggerimento: Ctrl+S salva, Ctrl+D aggiunge un cursore, Ctrl+F cerca.
            </span>
          </div>
        </div>
      )}
    </>
  );
}

export default CodeEditor;

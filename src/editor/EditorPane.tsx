import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
  crosshairCursor,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
} from "@codemirror/language";
import { useStore } from "../state/store";
import {
  editorTheme,
  latexAutocompletion,
  latexHighlighting,
  latexLanguage,
} from "./latex";
import styles from "../styles/panels.module.css";

function makeExtensions(path: string, fontSize: number): readonly never[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion(latexAutocompletion),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      indentWithTab,
      {
        key: "Mod-s",
        run: () => {
          const p = useStore.getState().activeTab;
          if (!p) return false;
          useStore.getState().saveFile(p);
          return true;
        },
      },
    ]),
    latexLanguage,
    latexHighlighting,
    editorTheme(fontSize),
    EditorView.lineWrapping,
    EditorView.updateListener.of((u) => {
      if (u.docChanged) {
        const current = useStore.getState().activeTab;
        if (!current || current !== path) return;
        useStore.getState().updateBuffer(current, u.state.doc.toString());
      }
    }),
  ] as never[];
}

export function EditorPane() {
  const rootPath = useStore((s) => s.rootPath);
  const tabs = useStore((s) => s.tabs);
  const activeTab = useStore((s) => s.activeTab);
  const dirty = useStore((s) => s.dirty);
  const binaryPaths = useStore((s) => s.binaryPaths);
  const buffers = useStore((s) => s.buffers);
  const fontSize = useStore((s) => s.settings.fontSize);
  const pendingJump = useStore((s) => s.pendingJump);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const statesRef = useRef<Map<string, EditorState>>(new Map());
  const prevRootRef = useRef<string | null>(null);

  // Create the single EditorView once.
  useEffect(() => {
    const view = new EditorView({ parent: containerRef.current! });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
      statesRef.current.clear();
    };
  }, []);

  // Swap the document when the active tab changes.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    // On project switch, drop the per-tab editor states cached from the
    // previous project: paths are relative, so a file with the same name
    // (e.g. main.tex) would otherwise show stale content and autosave it
    // over the new project's file.
    if (prevRootRef.current !== rootPath) {
      statesRef.current.clear();
      prevRootRef.current = rootPath;
    }
    if (!activeTab || !rootPath) {
      view.setState(EditorState.create({ doc: "" }));
      return;
    }
    const cached = statesRef.current.get(activeTab);
    if (cached) {
      view.setState(cached);
      return;
    }
    const content = buffers[activeTab] ?? "";
    const st = EditorState.create({
      doc: content,
      extensions: makeExtensions(activeTab, fontSize),
    });
    statesRef.current.set(activeTab, st);
    view.setState(st);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, rootPath]);

  // Apply the chosen font size to the current state.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !activeTab) return;
    const st = EditorState.create({
      doc: view.state.doc,
      selection: view.state.selection,
      extensions: makeExtensions(activeTab, fontSize),
    });
    statesRef.current.set(activeTab, st);
    view.setState(st);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontSize]);

  // Jump to a line requested from the output panel.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !pendingJump || pendingJump.path !== activeTab) return;
    const total = view.state.doc.lines;
    const lineNo = Math.min(Math.max(1, pendingJump.line), total);
    const info = view.state.doc.line(lineNo);
    view.dispatch({
      selection: { anchor: info.from },
      effects: EditorView.scrollIntoView(info.from, { y: "center" }),
    });
    view.focus();
  }, [pendingJump, activeTab]);

  return (
    <section className={styles.editorPane}>
      <div className={styles.tabBar}>
        {tabs.length === 0 && <span className={styles.tabEmpty}>Nessun file aperto</span>}
        {tabs.map((t) => (
          <div
            key={t.path}
            className={`${styles.tab} ${activeTab === t.path ? styles.tabActive : ""}`}
            onClick={() => useStore.getState().setActiveTab(t.path)}
          >
            <span className={styles.tabName}>{t.path.split("/").pop()}</span>
            {dirty[t.path] && <span className={styles.dirtyDot} title="Non salvato" />}
            <button
              className={styles.tabClose}
              title="Chiudi"
              onClick={(e) => {
                e.stopPropagation();
                statesRef.current.delete(t.path);
                useStore.getState().closeTab(t.path);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className={styles.editorHost}>
        {/*
          The CodeMirror host div must stay mounted at all times: the single
          EditorView is attached to it exactly once when the pane mounts.
          Conditionally unmounting this div used to leave the view detached
          from the DOM (tab bar visible, blank editing area, keystrokes lost),
          which made it impossible to write in any newly created file.
        */}
        <div className={styles.cmHost} ref={containerRef} />
        {activeTab && binaryPaths[activeTab] && (
          <div className={styles.binaryNotice}>
            File binario: questo tipo di file non viene modificato nell'editor.
          </div>
        )}
        {!activeTab && (
          <div className={styles.editorPlaceholder}>
            <p>
              Nessun file aperto. Creane uno con «+ file» nella colonna a
              sinistra, oppure aprine uno esistente. (Ctrl+S salva, F5 compila)
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

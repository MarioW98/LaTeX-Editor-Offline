import { useEffect, useRef } from "react";
import type { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useStore } from "../state/store.ts";
import { createEditorState, fontSizeEffect } from "./docState.ts";
import { VisualEditor } from "./VisualEditor.tsx";
import type { VisualEditorHandle } from "./VisualEditor.tsx";
import styles from "../styles/panels.module.css";
import visualStyles from "./visual.module.css";

export function EditorPane() {
  const rootPath = useStore((s) => s.rootPath);
  const tabs = useStore((s) => s.tabs);
  const activeTab = useStore((s) => s.activeTab);
  const dirty = useStore((s) => s.dirty);
  const binaryPaths = useStore((s) => s.binaryPaths);
  const buffers = useStore((s) => s.buffers);
  const fontSize = useStore((s) => s.settings.fontSize);
  const pendingJump = useStore((s) => s.pendingJump);
  const editorMode = useStore((s) => s.editorMode);
  const visualError = useStore((s) => s.visualError);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const statesRef = useRef<Map<string, EditorState>>(new Map());
  const prevRootRef = useRef<string | null>(null);
  const visualRef = useRef<VisualEditorHandle | null>(null);
  const prevTabRef = useRef<string | null>(null);

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
      view.setState(createEditorState("", "", fontSize, true));
      return;
    }
    const cached = statesRef.current.get(activeTab);
    if (cached) {
      view.setState(cached);
    } else {
      // Files flagged non-modifiable (binary or non UTF-8) get a read-only
      // document state: they cannot be typed into and never reach autosave.
      const st = createEditorState(
        buffers[activeTab] ?? "",
        activeTab,
        fontSize,
        !binaryPaths[activeTab],
      );
      statesRef.current.set(activeTab, st);
      view.setState(st);
    }
    // A state cached before a font-size change still carries the old
    // theme: reapply the current size (a no-op when already current).
    view.dispatch({ effects: fontSizeEffect(fontSize) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, rootPath]);

  // Apply the chosen font size by RECONFIGURING the theme compartment, in
  // place: the undo history, the code folding and the selection of the
  // open document survive (recreating the state used to wipe them).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: fontSizeEffect(fontSize) });
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

  // Cambio di tab mentre si è in modalità visuale: PRIMA il documento
  // visuale del tab precedente torna nel suo buffer (serializzato e
  // confrontato byte per byte: nessun edit perso, nessun dirty se non è
  // cambiato nulla), POI si rientra in Sorgente per il file nuovo.
  useEffect(() => {
    const precedente = prevTabRef.current;
    prevTabRef.current = activeTab;
    if (editorMode !== "visuale") return;
    if (!precedente || precedente === activeTab) return;
    const doc = visualRef.current?.getDocJson() ?? useStore.getState().visualDoc;
    if (doc) {
      useStore.getState().leaveVisual(precedente, doc);
    } else {
      useStore.setState({ editorMode: "sorgente", visualDoc: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const toggleDisabilitato = !activeTab || (activeTab in binaryPaths);
  const passaAVisuale = () => useStore.getState().toggleToVisual();
  const passaASorgente = () => {
    const doc = visualRef.current?.getDocJson() ?? useStore.getState().visualDoc;
    if (doc) {
      useStore.getState().toggleToSource(doc);
    } else {
      useStore.setState({ editorMode: "sorgente", visualDoc: null });
    }
  };

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
        <div className={visualStyles.modeToggle} role="group" aria-label="Modalità editor">
          <button
            type="button"
            className={editorMode === "sorgente" ? visualStyles.modeToggleAttivo : undefined}
            aria-pressed={editorMode === "sorgente"}
            disabled={editorMode === "sorgente" || toggleDisabilitato}
            title={
              toggleDisabilitato
                ? "Vista visuale non disponibile per questo file"
                : "Torna al sorgente LaTeX"
            }
            onClick={passaASorgente}
          >
            Sorgente
          </button>
          <button
            type="button"
            className={editorMode === "visuale" ? visualStyles.modeToggleAttivo : undefined}
            aria-pressed={editorMode === "visuale"}
            disabled={editorMode === "visuale" || toggleDisabilitato}
            title={
              toggleDisabilitato
                ? "Vista visuale non disponibile per questo file"
                : "Scrivi come in Word: il sorgente resta l'unica verità"
            }
            onClick={passaAVisuale}
          >
            Visuale
          </button>
        </div>
      </div>
      <div className={styles.editorHost}>
        {visualError && (
          <div className={visualStyles.visualErrorBar} role="alert">
            <span>{visualError}</span>
            <button type="button" onClick={() => useStore.getState().chiudiVisualError()}>
              Chiudi
            </button>
          </div>
        )}
        {/*
          The CodeMirror host div must stay mounted at all times: the single
          EditorView is attached to it exactly once when the pane mounts.
          Conditionally unmounting this div used to leave the view detached
          from the DOM (tab bar visible, blank editing area, keystrokes lost),
          which made it impossible to write in any newly created file.
          In modalità visuale si nasconde (display: none), mai si smonta.
        */}
        <div
          className={`${styles.cmHost} ${editorMode === "visuale" ? visualStyles.cmHostNascosto : ""}`}
          ref={containerRef}
        />
        {editorMode === "visuale" && (
          <div className={visualStyles.visualOverlay}>
            <VisualEditor ref={visualRef} />
          </div>
        )}
        {activeTab && binaryPaths[activeTab] && (
          <div className={styles.binaryNotice}>
            File binario o di testo non UTF-8: aperto in sola lettura per
            proteggerne il contenuto.
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

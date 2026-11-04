/**
 * Editor CodeMirror: una sola vista; il documento cambia in funzione della
 * tab attiva (`view.setState`). Il line wrapping si ri-configura tramite
 * Compartment senza perdere la cronologia.
 */
import { useEffect, useRef } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { docStates } from './docStates';
import { wrapCompartment } from './extensions';
import { editorApi } from './editorApi';
import { useEditorStore } from '../state/useEditorStore';
import { effectiveOf, useSettingsStore } from '../state/useSettingsStore';

export function CodeEditor(): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  const activePath = useEditorStore((s) => s.activePath);
  const docVersion = useEditorStore((s) => s.docVersion);
  const global = useSettingsStore((s) => s.global);
  const project = useSettingsStore((s) => s.project);
  const eff = effectiveOf(global, project);

  // Creazione/distruzione della vista (una sola volta).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const view = new EditorView({
      parent: host,
      state: EditorState.create({ doc: '', extensions: [] }),
    });
    viewRef.current = view;
    editorApi.setView(view);
    return () => {
      editorApi.setView(null);
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Collegamento del documento attivo.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (!activePath) {
      view.setState(EditorState.create({ doc: '', extensions: [] }));
      return;
    }
    let state = docStates.get(activePath);
    if (!state) return; // apertura asincrona in corso
    if (docStates.getWrap(activePath) !== eff.wordWrap) {
      state = state.update({
        effects: wrapCompartment.reconfigure(eff.wordWrap ? EditorView.lineWrapping : []),
      }).state;
      docStates.set(activePath, state);
      docStates.setWrap(activePath, eff.wordWrap);
    }
    view.setState(state);
    view.focus();

    const pending = editorApi.consumePending(activePath);
    if (pending) {
      const line = state.doc.line(Math.min(Math.max(1, pending.line), state.doc.lines));
      view.dispatch({
        selection: { anchor: line.from },
        effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
      });
    }
  }, [activePath, docVersion, eff.wordWrap]);

  return <div className="editor-host" style={{ fontSize: `${eff.editorFontSize}px` }} ref={hostRef} />;
}

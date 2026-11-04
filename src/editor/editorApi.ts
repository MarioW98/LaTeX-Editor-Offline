/**
 * Ponte imperativo verso la vista CodeMirror: usato da "vai alla riga"
 * (click su errore, Ctrl+clic su \ref) quando il file viene aperto in modo
 * asincrono rispetto al rendering dell'editor.
 */
import type { EditorView } from '@codemirror/view';

let view: EditorView | null = null;
let pendingGoto: { path: string; line: number } | null = null;

export const editorApi = {
  setView(v: EditorView | null): void {
    view = v;
  },
  getView(): EditorView | null {
    return view;
  },
  requestGoto(path: string, line: number): void {
    pendingGoto = { path, line };
  },
  /** Ritorna (e consuma) la richiesta pendente se riguarda il file attivo. */
  consumePending(path: string): { line: number } | null {
    if (pendingGoto && pendingGoto.path === path) {
      const line = pendingGoto.line;
      pendingGoto = null;
      return { line };
    }
    return null;
  },
};

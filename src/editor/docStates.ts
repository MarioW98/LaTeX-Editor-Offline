/**
 * Mappa dei documenti aperti: per ogni tab è conservato l'`EditorState`
 * (contenuto + cronologia undo/redo). Volutamente fuori da Zustand:
 * oggetti CodeMirror non serializzabili.
 */
import { EditorState } from '@codemirror/state';
import type { Extension } from '@codemirror/state';

const docs = new Map<string, EditorState>();
const wraps = new Map<string, boolean>();

export const docStates = {
  get(path: string): EditorState | undefined {
    return docs.get(path);
  },
  /** Valore di word wrap applicato all'ultimo stato creato/riconfigurato. */
  getWrap(path: string): boolean | undefined {
    return wraps.get(path);
  },
  setWrap(path: string, wrap: boolean): void {
    wraps.set(path, wrap);
  },
  has(path: string): boolean {
    return docs.has(path);
  },
  create(path: string, _rel: string, text: string, extensions: Extension[]): EditorState {
    const state = EditorState.create({ doc: text, extensions });
    docs.set(path, state);
    return state;
  },
  set(path: string, state: EditorState): void {
    docs.set(path, state);
  },
  delete(path: string): void {
    docs.delete(path);
    wraps.delete(path);
  },
  rename(oldPath: string, newPath: string): void {
    const state = docs.get(oldPath);
    if (state) {
      docs.delete(oldPath);
      docs.set(newPath, state);
    }
    const wrap = wraps.get(oldPath);
    if (wrap !== undefined) {
      wraps.delete(oldPath);
      wraps.set(newPath, wrap);
    }
  },
  clear(): void {
    docs.clear();
    wraps.clear();
  },
};

import { Compartment, EditorState } from "@codemirror/state";
import type { Extension, StateEffect, Text } from "@codemirror/state";
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
import { useStore } from "../state/store.ts";
import {
  editorTheme,
  latexAutocompletion,
  latexHighlighting,
  latexLanguage,
} from "./latex.ts";

/**
 * Compartment that holds the theme (font size). The font size is applied
 * by RECONFIGURING this compartment (see [`fontSizeEffect`]) instead of
 * recreating the document state: the undo/redo history, the code folding
 * and the selection of the user survive every size change.
 */
export const editorThemeCompartment = new Compartment();

/**
 * Effect that re-applies `fontSize` to any state built by
 * [`createEditorState`]. EditorPane dispatches it on the view when the
 * font size changes; the same effect drives the state-level test
 * (src/editor/docState.fontsize.test.ts).
 */
export function fontSizeEffect(fontSize: number): StateEffect<Extension> {
  // Upstream types `reconfigure` as `StateEffect<unknown>`; the value it
  // carries is the theme Extension built here.
  return editorThemeCompartment.reconfigure(
    editorTheme(fontSize),
  ) as StateEffect<Extension>;
}

/**
 * Extension set shared by every editor document.
 *
 * When `editable` is false (file flagged non-modifiable: binary or non
 * UTF-8) the document state gets `EditorState.readOnly.of(true)`: the
 * state itself refuses document changes, so a non-modifiable file can
 * never be typed into and its content can never reach the autosave.
 */
export function makeExtensions(
  path: string,
  fontSize: number,
  editable: boolean,
): readonly never[] {
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
    editorThemeCompartment.of(editorTheme(fontSize)),
    EditorView.lineWrapping,
    EditorView.updateListener.of((u) => {
      if (u.docChanged) {
        const current = useStore.getState().activeTab;
        if (!current || current !== path) return;
        useStore.getState().updateBuffer(current, u.state.doc.toString());
      }
    }),
    // Non-modifiable file: the document state itself is read-only.
    ...(editable ? [] : [EditorState.readOnly.of(true)]),
  ] as never[];
}

/**
 * Single entry point used by EditorPane to build the document state of a
 * tab. `editable === false` produces a read-only state (see above).
 */
export function createEditorState(
  doc: string | Text,
  path: string,
  fontSize: number,
  editable: boolean,
): EditorState {
  return EditorState.create({
    doc,
    extensions: makeExtensions(path, fontSize, editable),
  });
}

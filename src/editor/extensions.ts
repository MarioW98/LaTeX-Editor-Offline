/**
 * Assembly delle estensioni CodeMirror comuni a ogni documento.
 * Il compartment `wrapCompartment` permette di ri-configurare il line
 * wrapping senza ricreare lo stato.
 */
import { lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, keymap, EditorView } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { closeBrackets, closeBracketsKeymap, completionKeymap, autocompletion } from '@codemirror/autocomplete';
import { languageFor } from './latex/language';
import { latexCompletionSource } from './latex/completion';
import { beginAutoClose } from './latex/beginClose';

export const wrapCompartment = new Compartment();

export function baseExtensions(rel: string, wrap: boolean): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    languageFor(rel),
    // Auto-chiusura ( [ {: la config dei bracket vive nel languageData della lingua.
    closeBrackets(),
    autocompletion({ override: [latexCompletionSource] }),
    beginAutoClose,
    wrapCompartment.of(wrap ? EditorView.lineWrapping : []),
    keymap.of([
      ...closeBracketsKeymap,
      ...completionKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      indentWithTab,
    ]),
    EditorView.contentAttributes.of({ spellcheck: 'false' }),
  ];
}

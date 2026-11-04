/**
 * Auto-chiusura "prudente" degli ambienti: quando si digita `}` chiudendo
 * `\begin{ambiente}` (ambiente noto) e non esiste già un `\end` subito dopo,
 * aggiunge il blocco `\end{ambiente}` sotto il cursore.
 * Gli ambienti sconosciuti NON vengono auto-chiusi (prudenza).
 */
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { KNOWN_ENV_NAMES } from './envList';

export const beginAutoClose: Extension = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== '}') return false;

  const before = view.state.doc.sliceString(Math.max(0, from - 120), from);
  const m = /\\begin\{([A-Za-z*]+)$/.exec(before);
  if (!m) return false;
  const env = m[1];
  if (!KNOWN_ENV_NAMES.has(env)) return false;

  // Se subito dopo c'è già l'\end corrispondente, chiudi solo la graffa.
  const after = view.state.doc.sliceString(to, Math.min(view.state.doc.length, to + 120));
  if (after.startsWith(`\\end{${env}}`)) return false;

  view.dispatch({
    changes: { from, to, insert: '}\n\n\\end{' + env + '}' },
    selection: { anchor: from + 2 },
    userEvent: 'input.type',
  });
  return true;
});

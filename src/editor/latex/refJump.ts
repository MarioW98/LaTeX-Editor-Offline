/**
 * Sottolineatura + navigazione dei riferimenti:
 * - `\ref{...}`, `\cite{...}`, `\input{...}`... vengono sottolineati;
 * - Ctrl/Cmd+clic salta alla definizione (\label, voce .bib, file incluso).
 *
 * Il plugin non conosce gli store: riceve un hook `onToken(kind, arg)`
 * fornito dallo store editor (nessuna dipendenza circolare).
 */
import { ViewPlugin, Decoration, EditorView } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { RangeSetBuilder } from '@codemirror/state';

const REF_RE =
  /\\(label|ref|eqref|pageref|autoref|vref|cref|Cref|cite|citep|citet|citeauthor|citeyear|textcite|parencite|footcite|include|input|bibliography)(?:\[[^\]]*\])?\{([^}\s]+)\}/g;

export type RefTokenKind =
  | 'label'
  | 'ref'
  | 'eqref'
  | 'pageref'
  | 'autoref'
  | 'vref'
  | 'cref'
  | 'Cref'
  | 'cite'
  | 'citep'
  | 'citet'
  | 'citeauthor'
  | 'citeyear'
  | 'textcite'
  | 'parencite'
  | 'footcite'
  | 'include'
  | 'input'
  | 'bibliography';

export interface RefJumpHooks {
  onToken: (kind: RefTokenKind, arg: string) => void;
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    REF_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = REF_RE.exec(text)) !== null) {
      const start = from + m.index;
      const end = start + m[0].length;
      const cls = m[1] === 'label' ? 'cm-latex-def' : 'cm-latex-ref';
      builder.add(start, end, Decoration.mark({ class: cls }));
    }
  }
  return builder.finish();
}

export function makeRefJump(hooks: RefJumpHooks): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged) {
          this.decorations = buildDecorations(u.view);
        }
      }
    },
    {
      decorations: (v) => v.decorations,
      eventHandlers: {
        mousedown(event: MouseEvent, view: EditorView): boolean {
          if (!(event.metaKey || event.ctrlKey)) return false;
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos == null) return false;
          const line = view.state.doc.lineAt(pos);
          const offset = pos - line.from;
          REF_RE.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = REF_RE.exec(line.text)) !== null) {
            const start = m.index;
            const end = start + m[0].length;
            if (offset >= start && offset <= end) {
              event.preventDefault();
              hooks.onToken(m[1] as RefTokenKind, m[2]);
              return true;
            }
          }
          return false;
        },
      },
    },
  );
}

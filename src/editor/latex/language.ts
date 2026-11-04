/**
 * Evidenziazione sintassi LaTeX/BibTeX/Markdown per CodeMirror 6.
 *
 * Non esiste una grammaria Lezer ufficiale per LaTeX: usiamo `StreamLanguage`
 * con un tokenizer originale e leggero (nessuna dipendenza aggiuntiva,
 * comportamento completamente sotto controllo).
 * Il tokenizer restituisce nomi token (stringhe); i nomi non standard sono
 * mappati a tag Lezer tramite `tokenTable`, e lo stile visivo vive nelle
 * classi CSS `.tok-*` definite nel tema (chiaro/scuro).
 */
import { StreamLanguage, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';
import { tags as t } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';
import { extOf } from '../../utils/paths';

interface LatexTokenState {
  /** Dentro matematica ($...$, $$...$$, \[...\], \(...\)). */
  math: boolean;
  /** Dopo \begin{ o \end{: il prossimo gruppo è il nome ambiente. */
  envName: boolean;
}

/** Auto-chiusura prudente: solo ( [ { — le virgolette LaTeX (``'') restano manuali. */
const closeBracketsData = { closeBrackets: { brackets: ['(', '[', '{'] } };

const latexLanguage = StreamLanguage.define<LatexTokenState>({
  startState: () => ({ math: false, envName: false }),
  token(stream, st) {
    if (stream.eatSpace()) return null;
    const ch = stream.next();
    if (!ch) return null;

    if (ch === '%') {
      stream.skipToEnd();
      return 'comment';
    }

    if (ch === '\\') {
      const m = stream.match(/[A-Za-z]+/) as RegExpMatchArray | null;
      let name = m ? m[0] : '';
      if (!name) {
        // comando di un singolo carattere: \[ \] \( \% \$ \{ \\
        const c = stream.next();
        name = c ?? '';
        if (name === '[' || name === '(') st.math = true;
        else if (name === ']' || name === ')') st.math = false;
      }
      if (name === 'begin' || name === 'end') st.envName = true;
      return 'keyword';
    }

    if (ch === '{') {
      if (st.envName) {
        st.envName = false;
        stream.match(/[^}]*/);
        return 'env';
      }
      return 'bracket';
    }
    if (ch === '}') return 'bracket';
    if (ch === '[' || ch === ']') return 'bracket';

    if (ch === '$') {
      // `$$` gestito come toggle unico del display math.
      stream.eat('$');
      st.math = !st.math;
      return 'operator';
    }

    if (ch === '&' || ch === '#' || ch === '_' || ch === '^' || ch === '~') {
      return 'operator';
    }

    if (st.math) {
      stream.eatWhile((c) => c !== '$' && c !== '\\');
      return 'string';
    }
    return null;
  },
  tokenTable: {
    env: t.tagName,
  },
  languageData: {
    commentTokens: { line: '%' },
    ...closeBracketsData,
  },
});

/** Tokenizer minimale per file .bib. */
const bibLanguage = StreamLanguage.define<Record<string, never>>({
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.sol() && stream.match(/@[A-Za-z]+/)) return 'keyword';
    const ch = stream.next();
    if (!ch) return null;
    if (ch === '%') {
      stream.skipToEnd();
      return 'comment';
    }
    if (ch === '{' || ch === '}') return 'bracket';
    if (ch === '=') return 'operator';
    if (ch === '"') {
      stream.eatWhile((c) => c !== '"' && c !== '\n');
      return 'string';
    }
    return null;
  },
  languageData: {
    commentTokens: { line: '%' },
    ...closeBracketsData,
  },
});

/** Stile con classi CSS: i colori vivono nel tema (chiaro/scuro). */
export const latexHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, class: 'tok-kw' },
  { tag: t.comment, class: 'tok-comment' },
  { tag: t.tagName, class: 'tok-env' },
  { tag: t.bracket, class: 'tok-bracket' },
  { tag: t.operator, class: 'tok-op' },
  { tag: t.string, class: 'tok-math' },
]);

/** Estensione linguaggio completa in base all'estensione del file. */
export function languageFor(rel: string): Extension[] {
  const ext = extOf(rel);
  if (ext === 'md') return [markdown()];
  if (ext === 'bib') return [bibLanguage, syntaxHighlighting(latexHighlightStyle)];
  if (ext === 'tex' || ext === 'sty' || ext === 'cls') {
    return [latexLanguage, syntaxHighlighting(latexHighlightStyle)];
  }
  return [];
}

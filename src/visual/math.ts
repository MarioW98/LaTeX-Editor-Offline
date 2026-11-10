/**
 * M2 — La matematica dei chip, estratta e resa in sola lettura (KaTeX, MIT).
 *
 * Il sorgente LaTeX resta l'unica verità del documento: questo modulo NON
 * tocca il modello, il parse né il serialize. Prende la slice VERBATIM di un
 * chip e produce, quando quella slice è matematica, l'HTML di KaTeX per la
 * vista visuale.
 *
 * La copia di rendering NON è il sorgente: da essa si tolgono SOLO i pezzi
 * che nel PDF finale non producono inchiostro, ciascuno documentato e
 * inchiodato dai test di math.test.ts:
 *   - i delimitatori $ \( \[ $$: KaTeX li vuole fuori dal TeX, il fatto che
 *     la formula sia display si comunica col flag `display` (la forma
 *     \[...\] e $$...$$ è display, $...$ e \(...\) è inline);
 *   - \label{...}: marcatore invisibile del PDF; KaTeX non lo supporta e
 *     dall'equazione resa non cambia nulla a toglierlo.
 * Gli ambienti amsmath (equation, align, gather, multline, flalign, alignat,
 * con o senza stellina) restano CON il loro \begin/\end: KaTeX li capisce
 * nativamente e l'allineamento `&` esiste solo dentro l'ambiente.
 *
 * Se KaTeX rifiuta il TeX (comando sconosciuto, sintassi rotta) il risultato
 * è un errore TIPIZZATO: il chiamante mostra il chip grezzo come sempre, non
 * esiste strada che porti a un'eccezione non gestita.
 */
import katex from "katex";

/** Forma matematica estratta da una slice di chip, pronta per KaTeX. */
export interface MatematicaEstratta {
  /** TeX per KaTeX: corpo (delimitatori via) oppure ambiente completo. */
  tex: string;
  /** true per la matematica display (\[...\], $$...$$, ambienti amsmath). */
  display: boolean;
}

/** Esito del rendering: HTML pronto, oppure errore tipizzato (mai eccezioni). */
export type EsitoRender = { html: string } | { errore: string };

/**
 * Ambienti che KaTeX rende nativamente come matematica display. Il resto
 * (tikzpicture, tabular, center, figure, description…) NON è matematica:
 * resta chip grezzo.
 */
const AMBIANTI_DISPLAY = /\\begin\{((?:equation|align|gather|multline|flalign|alignat)\*?)\}([\s\S]*)\\end\{\1\}/;

/** Il marcatore invisibile \label{...}: si toglie SOLO dalla copia di rendering. */
const ETICHETTA = /\\label\s*\{[^}]*\}/g;

/**
 * Riconosce la matematica nella slice VERBATIM di un chip e ne estrae la
 * copia di rendering. Restituisce null per tutto ciò che matematica non è
 * (footnote, ref, tikzpicture, center, commenti, comandi non riconosciuti…):
 * il chiamante continua a mostrare il chip grezzo, byte per byte.
 */
export function estraiMatematica(latex: string): MatematicaEstratta | null {
  // 1. Ambienti amsmath: la slice intera (meno \label) va a KaTeX tale quale,
  //    wrapper compreso: dentro l'ambiente vivono `&`, `\\` e \nonumber.
  const ambiente = AMBIANTI_DISPLAY.exec(latex);
  if (ambiente !== null && ambiente[0] === latex) {
    return { tex: latex.replace(ETICHETTA, ""), display: true };
  }

  // 2. Delimitatori: il corpo (delimitatori via, bordi ripuliti) va a KaTeX.
  //    $$ si riconosce PRIMA di $, altrimenti $...$ mangerebbe metà slice.
  const delim = [
    { regex: /^\$\$([^$]+)\$\$$/, display: true },
    { regex: /^\\\[([\s\S]+)\\\]$/, display: true },
    { regex: /^\$([^$]+)\$$/, display: false },
    { regex: /^\\\(([\s\S]+)\\\)$/, display: false },
  ];
  for (const { regex, display } of delim) {
    const corrispondenza = regex.exec(latex);
    if (corrispondenza !== null) {
      const corpo = corrispondenza[1].replace(ETICHETTA, "").trim();
      // Corpo vuoto ($$ o $ $): niente da rendere, il chip resta grezzo.
      if (corpo.length === 0) return null;
      return { tex: corpo, display };
    }
  }
  return null;
}

/**
 * Rende il TeX con KaTeX. Restituisce { html } oppure { errore }: NON getta
 * mai, nemmeno su TeX che KaTeX rifiuta — chi chiama decide di mostrare il
 * chip grezzo, com'è sempre stato.
 */
export function renderMatematica(tex: string, display: boolean): EsitoRender {
  try {
    return {
      html: katex.renderToString(tex, { displayMode: display, throwOnError: true }),
    };
  } catch (e) {
    // katex.ParseError è un Error: il messaggio dice cosa e dove (posizione
    // nel TeX), sufficiente per il fallback del chip grezzo.
    const messaggio = e instanceof Error ? e.message : String(e);
    return { errore: messaggio };
  }
}

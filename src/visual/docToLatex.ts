import type { DocJson } from "./schema.ts";

/**
 * M1 — Motore puro: documento ProseMirror (JSON) → sorgente LaTeX.
 *
 * FORMA CANONICA DELL'OUTPUT (inchiodata dai golden test):
 *   - preambolo verbatim in testa, poi \begin{document}, una riga vuota tra
 *     i blocchi, \end{document}, coda verbatim (postamble);
 *   - \section{…}/\subsection{…}/\subsubsection{…} (con * quando starred),
 *     ognuno su una propria riga;
 *   - liste: \begin{itemize} a colonna 0, voci «\item» indentate di 2 spazi
 *     per livello di annidamento, lista annidata attaccata alla voce che la
 *     contiene (newline singolo), altri blocchi nella voce separati da riga
 *     vuota e indentati come la voce;
 *   - \begin{quote} e \begin{verbatim} senza indentazione interna;
 *   - testo: escape dei caratteri speciali LaTeX (\% \& \# \_ \$/, e in
 *     difesa \{ \} \ \textbackslash{} \textasciicircum{} per i caratteri
 *     digitati nella vista visuale; il ~ resta se stesso perché in LaTeX è
 *     già valido: spazio unibreak);
 *   - \emph{} è la forma canonica del corsivo (\textit{} viene normalizzato);
 *   - i chip (rawBlock, rawInline, preamble, postamble) sono riscritti byte
 *     per byte dalla loro slice VERBATIM: mai reinterpretati.
 *
 * La marcatura inline è emessa a blocchi annidati ben formati (l'algoritmo
 * a prefisso comune chiude e riapre i marcatori senza mai incrociarli).
 */

const COMANDO_MARCA: Record<string, string> = {
  bold: "textbf",
  italic: "emph",
  underline: "underline",
  code: "texttt",
};

const NOME_SEZIONE: Record<number, string> = {
  1: "section",
  2: "subsection",
  3: "subsubsection",
};

const ESCAPE_TESTO: Record<string, string> = {
  "%": "\\%",
  "&": "\\&",
  "#": "\\#",
  "_": "\\_",
  "$": "\\$",
  "{": "\\{",
  "}": "\\}",
  "\\": "\\textbackslash{}",
  "^": "\\textasciicircum{}",
};

/** Escape del testo di un nodo testo: mai caratteri speciali liberi. Il ~
 * resta com'è (LaTeX già valido, spazio unibreak): il round-trip di
 * «Sezione~\ref{...}» è un'identità byte per byte. */
function escapeTesto(testo: string): string {
  return testo.replace(/[%&#_${}\\^]/g, (c) => ESCAPE_TESTO[c] ?? c);
}

function latexDi(nodo: DocJson): string {
  const valore = nodo.attrs?.latex;
  return typeof valore === "string" ? valore : "";
}

function testoVerbatim(nodo: DocJson): string {
  return (nodo.content ?? [])
    .map((figlio) => (figlio.type === "text" ? figlio.text ?? "" : ""))
    .join("");
}

/** Lunghezza del prefisso comune fra le marche aperte e quelle di destinazione. */
function prefissoComune(aperte: string[], destinazione: string[]): number {
  const max = Math.min(aperte.length, destinazione.length);
  let i = 0;
  while (i < max && aperte[i] === destinazione[i]) i++;
  return i;
}

/** Serializza il contenuto inline di un paragrafo/titolo/voce di lista. */
function inline(contenuto: DocJson[]): string {
  const pezzi: string[] = [];
  let aperte: string[] = [];
  for (const figlio of contenuto) {
    if (figlio.type === "text") {
      const destinazione = (figlio.marks ?? []).map((m) => m.type);
      const comuni = prefissoComune(aperte, destinazione);
      for (let i = aperte.length - 1; i >= comuni; i--) pezzi.push("}");
      for (let i = comuni; i < destinazione.length; i++) {
        pezzi.push("\\" + (COMANDO_MARCA[destinazione[i]] ?? "textbf") + "{");
      }
      aperte = destinazione;
      pezzi.push(escapeTesto(figlio.text ?? ""));
    } else if (figlio.type === "rawInline") {
      // Chip: la slice verbatim, byte per byte.
      pezzi.push(latexDi(figlio));
    }
  }
  for (let i = aperte.length - 1; i >= 0; i--) pezzi.push("}");
  return pezzi.join("");
}

/** Serializza un blocco; `profondita` è il livello di annidamento delle liste. */
function blocco(nodo: DocJson, profondita: number): string {
  switch (nodo.type) {
    case "paragraph":
      return inline(nodo.content ?? []);
    case "heading": {
      const livello = Number(nodo.attrs?.level ?? 1);
      const nome = NOME_SEZIONE[livello] ?? "section";
      const stellina = nodo.attrs?.starred ? "*" : "";
      return "\\" + nome + stellina + "{" + inline(nodo.content ?? []) + "}";
    }
    case "bulletList":
      return lista(nodo, "itemize", profondita);
    case "orderedList":
      return lista(nodo, "enumerate", profondita);
    case "blockquote":
      return (
        "\\begin{quote}\n" +
        (nodo.content ?? []).map((figlio) => blocco(figlio, 0)).join("\n\n") +
        "\n\\end{quote}"
      );
    case "verbatim":
      return "\\begin{verbatim}" + testoVerbatim(nodo) + "\\end{verbatim}";
    case "rawBlock":
    case "preamble":
    case "postamble":
      return latexDi(nodo);
    default:
      return latexDi(nodo);
  }
}

function lista(nodo: DocJson, ambiente: string, profondita: number): string {
  const rientroLista = " ".repeat(4 * profondita);
  const rientroVoce = " ".repeat(4 * profondita + 2);
  const righe: string[] = [rientroLista + "\\begin{" + ambiente + "}"];
  for (const voce of nodo.content ?? []) {
    const figli = voce.content ?? [];
    let riga = rientroVoce + "\\item";
    let resto = "";
    let indiceFiglio = 0;
    const primo = figli[0];
    if (primo !== undefined && primo.type === "paragraph") {
      const testo = inline(primo.content ?? []);
      if (testo.length > 0) riga += " " + testo;
      indiceFiglio = 1;
    }
    for (let i = indiceFiglio; i < figli.length; i++) {
      const figlio = figli[i];
      if (figlio.type === "bulletList" || figlio.type === "orderedList") {
        const nome = figlio.type === "bulletList" ? "itemize" : "enumerate";
        resto += "\n" + lista(figlio, nome, profondita + 1);
      } else {
        resto += "\n\n" + rientroVoce + blocco(figlio, profondita);
      }
    }
    righe.push(riga + resto);
  }
  righe.push(rientroLista + "\\end{" + ambiente + "}");
  return righe.join("\n");
}

/**
 * Converte il documento ProseMirror (JSON) in sorgente LaTeX. Pura: nessuno
 * stato, nessun I/O. Un documento che contiene solo il preambolo (file senza
 * \begin{document}) si riserializza nel file originale tal quale.
 */
export function docToLatex(doc: DocJson): string {
  const figli = doc.content ?? [];

  // Frammento senza documento: solo il chip del preambolo, nessun wrapper.
  if (figli.length === 1 && figli[0].type === "preamble") {
    return latexDi(figli[0]);
  }

  const primo = figli[0];
  const ultimo = figli[figli.length - 1];
  const conPreambolo = primo !== undefined && primo.type === "preamble";
  const conCoda =
    ultimo !== undefined &&
    ultimo.type === "postamble" &&
    figli.length > (conPreambolo ? 1 : 0);

  const inizioCorpo = conPreambolo ? 1 : 0;
  const fineCorpo = conCoda ? figli.length - 1 : figli.length;
  const corpo = figli
    .slice(inizioCorpo, fineCorpo)
    .map((b) => blocco(b, 0))
    .join("\n\n");

  return (
    (conPreambolo ? latexDi(primo) : "") +
    "\\begin{document}\n" +
    corpo +
    "\n\\end{document}" +
    (conCoda ? latexDi(ultimo) : "")
  );
}

/**
 * Estrae tutte le slice VERBATIM portate dai chip del documento (preamble,
 * postamble, rawBlock, rawInline). È la base dei test di preservazione: ogni
 * slice deve essere una sottostringa byte per byte del sorgente originale.
 */
export function collectRawSlices(doc: DocJson): string[] {
  const slice: string[] = [];
  const visita = (nodo: DocJson): void => {
    if (
      nodo.type === "preamble" ||
      nodo.type === "postamble" ||
      nodo.type === "rawBlock" ||
      nodo.type === "rawInline"
    ) {
      slice.push(latexDi(nodo));
    }
    for (const figlio of nodo.content ?? []) visita(figlio);
  };
  for (const figlio of doc.content ?? []) visita(figlio);
  return slice;
}

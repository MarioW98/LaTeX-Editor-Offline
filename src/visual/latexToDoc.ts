import { latexParser } from "latex-utensils";
import { validaDocJson, type DocJson } from "./schema.ts";

/**
 * M1 — Motore puro: sorgente LaTeX → documento ProseMirror (JSON).
 *
 * STRUMENTO. Il parser LaTeX → AST è latex-utensils (MIT): qui si cammina il
 * suo AST usando le POSIZIONI dei nodi per estrarre dal sorgente le slice
 * VERBATIM. Il lexer di latex-utensils scarta i commenti e non emette nodi
 * per gli spazi tra i token: per questo ogni gap fra due nodi (e ogni
 * parbreak, che assorbe whitespace E commenti) viene ri-letto dal sorgente
 * con `scanSegmenti`, così i commenti diventano chip e il whitespace torna
 * colla di testo. Risultato: serialize(parse(s)) è byte per byte uguale a s
 * per ogni sorgente già in forma canonica (vedi i golden test).
 *
 * SEGMENTAZIONE.
 *   - Preambolo: dall'inizio del file fino a \begin{document} → UN chip
 *     `preamble` con la slice verbatim (comprende \newcommand e affini).
 *   - Corpo: tra \begin{document} e \end{document} → costrutti supportati.
 *   - Coda: tutto ciò che segue \end{document} → chip `postamble` verbatim.
 *   - Nessun \begin{document} nel file: l'intero file è il preambolo (il
 *     frammento resta intatto e il toggle resta innocuo).
 *   - \begin{document} mai chiuso: errore tipizzato LatexParseError
 *     (causa "struttura"); parse di latex-utensils che fallisce: stesso
 *     errore tipizzato (causa "sintassi"). Mai eccezioni non gestite.
 *
 * FORMA CANONICA DEL SERIALIZE (documentata dai golden test in
 * docToLatex.test.ts): blocchi separati da UNA riga vuota; voci di lista con
 * indentazione 2 spazi per livello; \begin{quote}/\begin{verbatim} senza
 * indentazione. Il parse accetta qualunque spaziatura e la normalizza in
 * quella forma: per gli spazi già canonici il round-trip è un'identità.
 */

/** Errore tipizzato del parse: la vista visuale non parte MAI con un crash. */
export class LatexParseError extends Error {
  readonly causa: "sintassi" | "struttura";

  constructor(causa: "sintassi" | "struttura", message: string) {
    super(message);
    this.name = "LatexParseError";
    this.causa = causa;
  }
}

export function isLatexParseError(e: unknown): e is LatexParseError {
  return e instanceof LatexParseError;
}

// ---- Tipi strutturali dell'AST di latex-utensils (solo i campi usati) ----

interface LuPosition {
  offset: number;
  line: number;
  column: number;
}

interface LuLocation {
  start: LuPosition;
  end: LuPosition;
}

interface LuNode {
  kind: string;
  name?: string;
  content?: LuNode[] | string;
  args?: LuArg[];
  location?: LuLocation;
}

interface LuArg {
  kind: string;
  content?: LuNode[];
  location?: LuLocation;
}

interface LuAst {
  content: LuNode[];
}

// ---- Tabella dei costrutti supportati ----

const LIVELLO_SEZIONE: Record<string, number> = {
  section: 1,
  "section*": 1,
  subsection: 2,
  "subsection*": 2,
  subsubsection: 3,
  "subsubsection*": 3,
};

const MARCA_DA_COMANDO: Record<string, string> = {
  textbf: "bold",
  emph: "italic",
  textit: "italic",
  underline: "underline",
  texttt: "code",
};

const COMANDO_MARCA: Record<string, string> = {};
for (const [comando, marca] of Object.entries(MARCA_DA_COMANDO)) {
  if (COMANDO_MARCA[marca] === undefined) COMANDO_MARCA[marca] = comando;
}

/** Escape letterali supportati come testo: \% \& \# \_ \$ → carattere. */
const CARATTERI_ESCAPE = new Set(["%", "$", "_", "&", "#"]);

const AMBIENTI_LISTA = new Set(["itemize", "enumerate"]);

/**
 * Riga vuota (separatore di paragrafo): due newline con in mezzo solo spazi
 * o tab. La forma \r?\n copre anche i file con fine riga CRLF, che vanno
 * comunque spezzati in paragrafi (il serialize li normalizza a LF).
 */
const RIGA_VUOTA = /\r?\n[ \t]*\r?\n/;

// ---- Token inline del motore ----

/** Token inline in accumulo: testo con marche attive oppure chip grezzo. */
type TokenInline =
  | { tipo: "testo"; testo: string; marche: string[] }
  | { tipo: "chip"; latex: string };

/** Ricettacolo dei token inline: il walker dei blocchi o il titolo di una sezione. */
interface SinkInline {
  pushTesto(testo: string, marche: string[]): void;
  pushChip(latex: string): void;
}

// ---- Scansione dei gap (whitespace + commenti) ----

interface SegmentoGap {
  commento: boolean;
  testo: string;
}

/**
 * Divide un gap del sorgente in segmenti di whitespace e commenti (%...).
 * Il commento arriva fino a fine riga ESCLUSO il newline, che resta nel
 * segmento whitespace successivo: così il colla testo conserva i newline.
 */
function scanSegmenti(testo: string): SegmentoGap[] {
  const segmenti: SegmentoGap[] = [];
  const re = /%[^\n\r]*/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(testo)) !== null) {
    if (m.index > ultimo) segmenti.push({ commento: false, testo: testo.slice(ultimo, m.index) });
    segmenti.push({ commento: true, testo: m[0] });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < testo.length) segmenti.push({ commento: false, testo: testo.slice(ultimo) });
  return segmenti;
}

/** true se il token è solo whitespace. */
function eSoloWhitespace(testo: string): boolean {
  return /^\s*$/.test(testo);
}

function stessoMarche(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((m, i) => m === b[i]);
}

/** Costruisce i nodi inline PM a partire dai token di un paragrafo/titolo. */
function costruisciInline(token: TokenInline[]): DocJson[] {
  // 1. unisci i token testo adiacenti con le stesse marche (i chip interrompono).
  const uniti: TokenInline[] = [];
  for (const tok of token) {
    const prev = uniti[uniti.length - 1];
    if (
      tok.tipo === "testo" &&
      prev !== undefined &&
      prev.tipo === "testo" &&
      stessoMarche(prev.marche, tok.marche)
    ) {
      prev.testo += tok.testo;
    } else {
      uniti.push({ ...tok });
    }
  }
  // 2. il whitespace ai bordi del paragrafo appartiene alla separazione fra
  //    blocchi, non al contenuto: si taglia SOLO dai token testo estremi.
  const primo = uniti[0];
  if (primo !== undefined && primo.tipo === "testo") {
    primo.testo = primo.testo.replace(/^\s+/, "");
  }
  const ultimo = uniti[uniti.length - 1];
  if (ultimo !== undefined && ultimo.tipo === "testo") {
    ultimo.testo = ultimo.testo.replace(/\s+$/, "");
  }
  // 3. nodi PM (il testo vuoto non esiste in ProseMirror).
  const nodi: DocJson[] = [];
  for (const tok of uniti) {
    if (tok.tipo === "testo") {
      if (tok.testo.length === 0) continue;
      const nodo: DocJson = { type: "text", text: tok.testo };
      if (tok.marche.length > 0) {
        nodo.marks = tok.marche.map((m) => ({ type: m }));
      }
      nodi.push(nodo);
    } else {
      nodi.push({ type: "rawInline", attrs: { latex: tok.latex } });
    }
  }
  return nodi;
}

// ---- Walker inline (dentro un argomento di \textbf, nel titolo di una sezione…) ----

/**
 * Inizio del contenuto di un argomento tra graffe. latex-utensils fa
 * partire la location dell'argomento dal primo whitespace che lo precede
 * (`\section {A}` → location da colonna 8, la graffa è a colonna 9): la
 * graffa si cerca nel sorgente, così il contenuto parte sempre dopo di essa.
 */
function inizioArgomento(sorgente: string, arg: LuNode): number {
  const da = arg.location?.start.offset ?? 0;
  const graffa = sorgente.indexOf("{", da);
  return graffa >= 0 ? graffa + 1 : da + 1;
}

function fineArgomento(arg: LuNode): number {
  return (arg.location?.end.offset ?? 0) - 1;
}

/**
 * Cammina i nodi in contesto INLINE: tutto ciò che non è testo, escape o
 * marcatore riconosciuto diventa un chip verbatim (nessun blocco può nascere
 * dentro un argomento inline). I parbreak diventano colla di testo.
 */
function camminaInline(
  sorgente: string,
  nodi: LuNode[],
  da: number,
  a: number,
  marche: string[],
  sink: SinkInline,
): void {
  let cursore = da;
  for (const nodo of nodi) {
    const inizioNodo = nodo.location?.start.offset ?? cursore;
    const fineNodo = nodo.location?.end.offset ?? cursore;
    gapInline(sorgente.slice(cursore, inizioNodo), marche, sink);
    nodoInline(sorgente, nodo, marche, sink);
    cursore = fineNodo;
  }
  gapInline(sorgente.slice(cursore, a), marche, sink);
}

function gapInline(gap: string, marche: string[], sink: SinkInline): void {
  for (const seg of scanSegmenti(gap)) {
    if (seg.commento) {
      sink.pushChip(seg.testo);
    } else if (eSoloWhitespace(seg.testo)) {
      sink.pushTesto(seg.testo, marche);
    } else {
      // Residuo che il lexer non ha rappresentato: lo si conserva verbatim.
      sink.pushChip(seg.testo);
    }
  }
}

function nodoInline(
  sorgente: string,
  nodo: LuNode,
  marche: string[],
  sink: SinkInline,
): void {
  switch (nodo.kind) {
    case "text.string":
      sink.pushTesto(String(nodo.content ?? ""), marche);
      return;
    case "parbreak": {
      // Dentro un argomento inline un parbreak è solo colla: la slice
      // verbatim (newline inclusi) torna nel testo.
      const slice = sorgente.slice(
        nodo.location?.start.offset ?? 0,
        nodo.location?.end.offset ?? 0,
      );
      sink.pushTesto(slice, marche);
      return;
    }
    case "command": {
      const nome = nodo.name ?? "";
      const args = nodo.args ?? [];
      if (CARATTERI_ESCAPE.has(nome) && args.length === 0) {
        // \% → il carattere letterale.
        sink.pushTesto(nome, marche);
        return;
      }
      if (
        MARCA_DA_COMANDO[nome] !== undefined &&
        args.length === 1 &&
        args[0].kind === "arg.group"
      ) {
        camminaInline(
          sorgente,
          args[0].content ?? [],
          inizioArgomento(sorgente, args[0]),
          fineArgomento(args[0]),
          [...marche, MARCA_DA_COMANDO[nome]],
          sink,
        );
        return;
      }
      sink.pushChip(sliceDi(sorgente, nodo));
      return;
    }
    case "inlineMath":
    default:
      // Qualunque altro nodo in contesto inline è LaTeX grezzo: chip verbatim.
      sink.pushChip(sliceDi(sorgente, nodo));
      return;
  }
}

// ---- Raccolta del titolo di una sezione in un sink dedicato ----

class SinkTitolo implements SinkInline {
  token: TokenInline[] = [];

  pushTesto(testo: string, marche: string[]): void {
    if (testo.length > 0) this.token.push({ tipo: "testo", testo, marche });
  }

  pushChip(latex: string): void {
    this.token.push({ tipo: "chip", latex });
  }
}

// ---- Walker dei blocchi (il corpo del documento) ----

function sliceDi(sorgente: string, nodo: LuNode): string {
  const da = nodo.location?.start.offset ?? 0;
  const a = nodo.location?.end.offset ?? 0;
  return sorgente.slice(da, a);
}

/** Range del contenuto di un environment (tra \begin{nome} e \end{nome}). */
function rangeContenuto(sorgente: string, nodo: LuNode): { da: number; a: number } {
  const nome = nodo.name ?? "";
  const inizioEnv = nodo.location?.start.offset ?? 0;
  const fineEnv = nodo.location?.end.offset ?? sorgente.length;
  const da = sorgente.indexOf("}", inizioEnv) + 1;
  const chiusura = "\\end{" + nome + "}";
  const trovato = sorgente.lastIndexOf(chiusura, fineEnv - 1);
  const a = trovato >= 0 ? trovato : Math.max(da, fineEnv - chiusura.length);
  return { da, a };
}

class WalkerBlocchi implements SinkInline {
  private blocchi: DocJson[] = [];
  /** Token del paragrafo corrente (vuoto quando il paragrafo è chiuso). */
  private corrente: TokenInline[] = [];
  /**
   * Token in sospeso visti mentre il paragrafo era chiuso (whitespace e
   * commenti): se il paragrafo si aprono diventano i suoi token di testa
   * (un commento subito prima di un testo resta un chip inline al posto
   * giusto, byte per byte); se arriva un blocco o una riga vuota, i commenti
   * diventano chip di blocco e il whitespace si perde nella separazione.
   */
  private sospesi: TokenInline[] = [];
  private aperto = false;

  private readonly sorgente: string;

  constructor(sorgente: string) {
    this.sorgente = sorgente;
  }

  // ---- SinkInline (contesto inline dentro il paragrafo corrente) ----

  pushTesto(testo: string, marche: string[]): void {
    if (testo.length === 0) return;
    this.apriParagrafo();
    this.corrente.push({ tipo: "testo", testo, marche });
  }

  pushChip(latex: string): void {
    this.apriParagrafo();
    this.corrente.push({ tipo: "chip", latex });
  }

  private apriParagrafo(): void {
    if (this.aperto) return;
    this.aperto = true;
    this.corrente = this.sospesi;
    this.sospesi = [];
  }

  private chiudiParagrafo(): void {
    if (this.aperto) {
      const contenuto = costruisciInline(this.corrente);
      if (contenuto.length > 0) {
        this.blocchi.push({ type: "paragraph", content: contenuto });
      }
      this.corrente = [];
      this.aperto = false;
    } else {
      this.svuotaSospesiComeBlocchi();
    }
  }

  private svuotaSospesiComeBlocchi(): void {
    for (const tok of this.sospesi) {
      if (tok.tipo === "chip") this.blocchi.push({ type: "rawBlock", attrs: { latex: tok.latex } });
    }
    this.sospesi = [];
  }

  // ---- Camminata ----

  walk(nodi: LuNode[], da: number, a: number): DocJson[] {
    let cursore = da;
    for (const nodo of nodi) {
      const inizioNodo = nodo.location?.start.offset ?? cursore;
      const fineNodo = nodo.location?.end.offset ?? cursore;
      this.gap(this.sorgente.slice(cursore, inizioNodo));
      this.nodo(nodo);
      cursore = fineNodo;
    }
    this.gap(this.sorgente.slice(cursore, a));
    this.chiudiParagrafo();
    this.svuotaSospesiComeBlocchi();
    return this.blocchi;
  }

  /**
   * Gap a livello di blocco: whitespace e commenti letti dal sorgente.
   * Il whitespace con riga vuota chiude il paragrafo; senza riga vuota resta
   * colla; i commenti entrano nel paragrafo (se aperto) o restano in sospeso.
   */
  private gap(testo: string): void {
    for (const seg of scanSegmenti(testo)) {
      if (seg.commento) {
        if (this.aperto) this.pushChip(seg.testo);
        else this.sospesi.push({ tipo: "chip", latex: seg.testo });
        continue;
      }
      if (!eSoloWhitespace(seg.testo)) {
        // Residuo non rappresentato dal lexer: chip verbatim, mai perso.
        if (this.aperto) this.pushChip(seg.testo);
        else this.sospesi.push({ tipo: "chip", latex: seg.testo });
        continue;
      }
      if (this.aperto) {
        if (RIGA_VUOTA.test(seg.testo)) this.chiudiParagrafo();
        else this.pushTesto(seg.testo, []);
      } else {
        if (RIGA_VUOTA.test(seg.testo)) this.svuotaSospesiComeBlocchi();
        else this.sospesi.push({ tipo: "testo", testo: seg.testo, marche: [] });
      }
    }
  }

  private nodo(nodo: LuNode): void {
    switch (nodo.kind) {
      case "text.string":
        this.pushTesto(String(nodo.content ?? ""), []);
        return;
      case "parbreak": {
        // Il parbreak assorbe whitespace e commenti: la sua slice si
        // ri-analizza come gap (stessa regola, byte per byte).
        this.gap(sliceDi(this.sorgente, nodo));
        return;
      }
      case "command":
        this.comando(nodo);
        return;
      case "env":
        this.environment(nodo);
        return;
      case "env.verbatim":
        this.chiudiParagrafo();
        this.blocchi.push({
          type: "verbatim",
          content: [
            { type: "text", text: typeof nodo.content === "string" ? nodo.content : "" },
          ],
        });
        return;
      case "inlineMath":
        this.pushChip(sliceDi(this.sorgente, nodo));
        return;
      case "env.math.align":
      case "displayMath":
        this.chiudiParagrafo();
        this.blocchi.push({ type: "rawBlock", attrs: { latex: sliceDi(this.sorgente, nodo) } });
        return;
      default:
        // Nodi che non dovrebbero apparire a livello di blocco: verbatim.
        this.pushChip(sliceDi(this.sorgente, nodo));
        return;
    }
  }

  private comando(nodo: LuNode): void {
    const nome = nodo.name ?? "";
    const args = nodo.args ?? [];
    const unSoloArgGroup = args.length === 1 && args[0].kind === "arg.group";

    if (CARATTERI_ESCAPE.has(nome) && args.length === 0) {
      this.pushTesto(nome, []);
      return;
    }
    if (MARCA_DA_COMANDO[nome] !== undefined && unSoloArgGroup) {
      camminaInline(
        this.sorgente,
        args[0].content ?? [],
        inizioArgomento(this.sorgente, args[0]),
        fineArgomento(args[0]),
        [MARCA_DA_COMANDO[nome]],
        this,
      );
      return;
    }
    if (LIVELLO_SEZIONE[nome] !== undefined && unSoloArgGroup) {
      this.chiudiParagrafo();
      const sink = new SinkTitolo();
      camminaInline(
        this.sorgente,
        args[0].content ?? [],
        inizioArgomento(this.sorgente, args[0]),
        fineArgomento(args[0]),
        [],
        sink,
      );
      this.blocchi.push({
        type: "heading",
        attrs: { level: LIVELLO_SEZIONE[nome], starred: nome.endsWith("*") },
        content: costruisciInline(sink.token),
      });
      return;
    }
    this.pushChip(sliceDi(this.sorgente, nodo));
  }

  private environment(nodo: LuNode): void {
    const nome = nodo.name ?? "";
    // \begin{itemize}[…] o \begin{quote}[…]: opzioni non supportate → chip.
    if ((nodo.args ?? []).length > 0) {
      this.chiudiParagrafo();
      this.blocchi.push({ type: "rawBlock", attrs: { latex: sliceDi(this.sorgente, nodo) } });
      return;
    }
    if (AMBIENTI_LISTA.has(nome)) {
      this.lista(nodo);
      return;
    }
    if (nome === "quote") {
      this.citazione(nodo);
      return;
    }
    // tikzpicture, tabular, center, figure, equation* senza math-align, …
    this.chiudiParagrafo();
    this.blocchi.push({ type: "rawBlock", attrs: { latex: sliceDi(this.sorgente, nodo) } });
  }

  /**
   * Liste itemize/enumerate. Una lista con voci «strane» (\item[opzione],
   * contenuto prima del primo \item, commenti prima del primo \item, lista
   * vuota) resta UN chip verbatim: editabile solo in Sorgente, mai distorta.
   */
  private lista(nodo: LuNode): void {
    const nome = nodo.name ?? "itemize";
    const contenuto = Array.isArray(nodo.content) ? nodo.content : [];
    const { da, a } = rangeContenuto(this.sorgente, nodo);
    const chipLista = () => {
      this.chiudiParagrafo();
      this.blocchi.push({ type: "rawBlock", attrs: { latex: sliceDi(this.sorgente, nodo) } });
    };

    const indiciItem: number[] = [];
    for (let i = 0; i < contenuto.length; i++) {
      const n = contenuto[i];
      if (n.kind === "command" && n.name === "item") {
        if ((n.args ?? []).length > 0) {
          chipLista();
          return;
        }
        indiciItem.push(i);
      }
    }
    if (indiciItem.length === 0) {
      chipLista();
      return;
    }
    const prima = contenuto.slice(0, indiciItem[0]);
    const gapIniziale = this.sorgente.slice(da, contenuto[indiciItem[0]].location?.start.offset ?? da);
    const haCommentoIniziale = scanSegmenti(gapIniziale).some((s) => s.commento);
    if (prima.some((n) => n.kind !== "parbreak") || haCommentoIniziale) {
      chipLista();
      return;
    }

    const voci: DocJson[] = [];
    for (let k = 0; k < indiciItem.length; k++) {
      const nodoItem = contenuto[indiciItem[k]];
      const daVoce = nodoItem.location?.end.offset ?? da;
      const prossimo = k + 1 < indiciItem.length ? indiciItem[k + 1] : contenuto.length;
      const fineVoce =
        k + 1 < indiciItem.length
          ? contenuto[indiciItem[k + 1]].location?.start.offset ?? a
          : a;
      const walker = new WalkerBlocchi(this.sorgente);
      const blocchiVoce = walker.walk(contenuto.slice(indiciItem[k] + 1, prossimo), daVoce, fineVoce);
      if (blocchiVoce[0]?.type !== "paragraph") {
        blocchiVoce.unshift({ type: "paragraph" });
      }
      voci.push({ type: "listItem", content: blocchiVoce });
    }
    this.chiudiParagrafo();
    this.blocchi.push({
      type: nome === "itemize" ? "bulletList" : "orderedList",
      content: voci,
    });
  }

  private citazione(nodo: LuNode): void {
    const { da, a } = rangeContenuto(this.sorgente, nodo);
    const walker = new WalkerBlocchi(this.sorgente);
    const blocchi = walker.walk(
      Array.isArray(nodo.content) ? nodo.content : [],
      da,
      a,
    );
    this.chiudiParagrafo();
    this.blocchi.push({
      type: "blockquote",
      content: blocchi.length > 0 ? blocchi : [{ type: "paragraph" }],
    });
  }
}

// ---- Ricerca di un \begin{document} mai trasformato in environment ----

function contieneBeginDocument(nodi: LuNode[]): boolean {
  for (const nodo of nodi) {
    if (nodo.kind === "command" && nodo.name === "begin") {
      const arg = (nodo.args ?? []).find((a) => a.kind === "arg.group");
      const nome = (arg?.content ?? [])
        .filter((c: LuNode) => c.kind === "text.string")
        .map((c: LuNode) => String(c.content ?? ""))
        .join("")
        .trim();
      if (nome === "document") return true;
    }
    if (Array.isArray(nodo.content) && contieneBeginDocument(nodo.content)) return true;
    for (const arg of nodo.args ?? []) {
      if (Array.isArray(arg.content) && contieneBeginDocument(arg.content)) return true;
    }
  }
  return false;
}

// ---- Ingresso del motore ----

/**
 * Converte un sorgente LaTeX nel documento ProseMirror (JSON) della vista
 * visuale. Pura: nessuno stato, nessun I/O, nessuna dipendenza dal DOM.
 * Solleva LatexParseError (tipizzato) su sorgenti malformati.
 */
export function latexToDoc(sorgente: string): DocJson {
  let ast: LuAst;
  try {
    ast = latexParser.parse(sorgente) as unknown as LuAst;
  } catch (e) {
    const dettaglio = e instanceof Error ? e.message : String(e);
    throw new LatexParseError("sintassi", `parser LaTeX fallito: ${dettaglio}`);
  }

  const docEnv = ast.content.find((n) => n.kind === "env" && n.name === "document");
  if (docEnv?.location === undefined) {
    if (contieneBeginDocument(ast.content)) {
      throw new LatexParseError(
        "struttura",
        "\\begin{document} non è mai chiuso da \\end{document}",
      );
    }
    // Nessun documento nel file: l'intero file è preambolo, resta intatto.
    return validaDocJson({ type: "doc", content: [{ type: "preamble", attrs: { latex: sorgente } }] });
  }

  const inizioEnv = docEnv.location.start.offset;
  const fineEnv = docEnv.location.end.offset;
  const preambolo = sorgente.slice(0, inizioEnv);
  const coda = sorgente.slice(fineEnv);
  const inizioCorpo = sorgente.indexOf("}", inizioEnv) + 1;
  const fineCorpo = Math.max(
    inizioCorpo,
    sorgente.lastIndexOf("\\end", fineEnv - 1) > 0
      ? sorgente.lastIndexOf("\\end", fineEnv - 1)
      : fineEnv,
  );

  const walker = new WalkerBlocchi(sorgente);
  const blocchi = walker.walk(
    Array.isArray(docEnv.content) ? docEnv.content : [],
    inizioCorpo,
    fineCorpo,
  );

  return validaDocJson({
    type: "doc",
    content: [
      { type: "preamble", attrs: { latex: preambolo } },
      ...blocchi,
      { type: "postamble", attrs: { latex: coda } },
    ],
  });
}

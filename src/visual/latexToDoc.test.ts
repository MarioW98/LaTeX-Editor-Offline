/**
 * M1 — Test del parse (latexToDoc): LaTeX → documento ProseMirror.
 *
 * Ogni test inchioda la FORMA del documento prodotto: chip con slice
 * VERBATIM (byte per byte come nel sorgente), strutture del subset
 * supportato, errori tipizzati sui sorgenti malformati. I test di
 * preservazione/idempotenza del round-trip completo stanno in
 * docToLatex.test.ts.
 *
 * Si esegue con `npm test` (node --test --experimental-strip-types).
 */
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { isLatexParseError, LatexParseError, latexToDoc } from "./latexToDoc.ts";
import type { DocJson } from "./schema.ts";

// La fixture letta dal disco viene normalizzata a LF: il test deve dipendere
// dal CONTENUTO, non dal fine riga del worktree (CRLF su Windows con
// core.autocrlf). Il comportamento su input CRLF vero è pinnato da un
// golden dedicato in docToLatex.test.ts e dai test CRLF dello store.
const FIXTURE = readFileSync(new URL("./fixtures/documento.tex", import.meta.url), "utf8").replace(
  /\r\n/g,
  "\n",
);

/** Nodi di un dato tipo, cercati ricorsivamente, in ordine di apparizione. */
function blocchi(doc: DocJson, tipo: string): DocJson[] {
  const trovati: DocJson[] = [];
  const visita = (nodi: DocJson[] | undefined): void => {
    for (const n of nodi ?? []) {
      if (n.type === tipo) trovati.push(n);
      visita(n.content);
    }
  };
  visita(doc.content);
  return trovati;
}

/** Primo nodo di un dato tipo, cercato ricorsivamente. */
function primoNodo(doc: DocJson, tipo: string): DocJson | undefined {
  const visita = (nodi: DocJson[] | undefined): DocJson | undefined => {
    for (const n of nodi ?? []) {
      if (n.type === tipo) return n;
      const dentro = visita(n.content);
      if (dentro !== undefined) return dentro;
    }
    return undefined;
  };
  return visita(doc.content);
}

/** Nodi testo (concatenati) di un contenuto inline. */
function testoDi(contenuto: DocJson[] | undefined): string {
  return (contenuto ?? [])
    .filter((n) => n.type === "text")
    .map((n) => n.text ?? "")
    .join("");
}

/** Attributo `latex` di un chip. */
function latexDi(nodo: DocJson | undefined): string {
  const valore = nodo?.attrs?.latex;
  return typeof valore === "string" ? valore : "";
}

// ---- Segmentazione: preambolo, corpo, coda ----

test("preambolo: un unico chip verbatim fino a \\begin{document}", () => {
  const doc = latexToDoc(FIXTURE);
  const preambolo = doc.content?.[0];
  assert.equal(preambolo?.type, "preamble", "il primo figlio non è il preambolo");
  const atteso = FIXTURE.slice(0, FIXTURE.indexOf("\\begin{document}"));
  assert.equal(latexDi(preambolo), atteso, "la slice del preambolo non è byte per byte");
  assert.ok(atteso.includes("\\newcommand{\\sigla}[1]{\\textsc{#1}}"));
});

test("coda: chip verbatim con ciò che segue \\end{document}", () => {
  const doc = latexToDoc(FIXTURE);
  const ultimo = doc.content?.[doc.content.length - 1];
  assert.equal(ultimo?.type, "postamble");
  const atteso = FIXTURE.slice(FIXTURE.lastIndexOf("\\end{document}") + "\\end{document}".length);
  assert.equal(latexDi(ultimo), atteso);
  assert.ok(latexDi(ultimo).includes("% Fine del file"));
});

test("file senza \\begin{document}: l'intero file è preambolo, intatto", () => {
  const sorgente = "solo preambolo\n\\newcommand{\\x}{y}\n";
  const doc = latexToDoc(sorgente);
  assert.equal(doc.content?.length, 1);
  assert.equal(doc.content?.[0]?.type, "preamble");
  assert.equal(latexDi(doc.content?.[0]), sorgente);
});

test("\\begin{document} mai chiuso: errore tipizzato, causa struttura", () => {
  assert.throws(
    () => latexToDoc("pre\n\\begin{document}\ntesto\n"),
    (e: unknown) => {
      assert.ok(isLatexParseError(e), "l'errore non è tipizzato");
      assert.equal((e as LatexParseError).causa, "struttura");
      return true;
    },
  );
});

test("sorgente con sintassi rotta: errore tipizzato, causa sintassi, mai eccezioni nude", () => {
  assert.throws(
    () => latexToDoc("\\begin{document}\n\\textbf{mai chiuso\n\\end{document}\n"),
    (e: unknown) => {
      assert.ok(isLatexParseError(e), "l'errore non è tipizzato");
      assert.equal((e as LatexParseError).causa, "sintassi");
      return true;
    },
  );
});

test("documento vuoto: nessun blocco, preambolo e coda vuoti", () => {
  const doc = latexToDoc("\\begin{document}\n\\end{document}\n");
  assert.equal(doc.content?.length, 2, "attesi solo preambolo e coda");
  assert.equal(doc.content?.[0]?.type, "preamble");
  assert.equal(doc.content?.[1]?.type, "postamble");
  assert.equal(latexDi(doc.content?.[0]), "");
  assert.equal(latexDi(doc.content?.[1]), "\n");
});

// ---- Sezioni ----

test("sezioni: livello, forma stellata, titolo con marcatura inline", () => {
  const doc = latexToDoc(
    "\\begin{document}\n\\section{Introduzione}\n\\section*{Nota}\n\\subsection{Dettagli}\n\\subsubsection{Ancora}\n\\end{document}\n",
  );
  const titoli = blocchi(doc, "heading");
  assert.equal(titoli.length, 4);
  assert.equal(titoli[0]?.attrs?.level ?? 1, 1);
  assert.equal(titoli[0]?.attrs?.starred ?? false, false);
  assert.equal(titoli[1]?.attrs?.level ?? 1, 1);
  assert.equal(titoli[1]?.attrs?.starred ?? false, true, "la forma * non è arrivata");
  assert.equal(titoli[2]?.attrs?.level ?? 1, 2);
  assert.equal(titoli[3]?.attrs?.level ?? 1, 3);

  const conMark = latexToDoc("\\begin{document}\n\\section{Il \\textbf{problema} del rendering}\n\\end{document}\n");
  const titolo = blocchi(conMark, "heading")[0];
  const grassetto = (titolo?.content ?? []).find((n) => n.marks?.some((m) => m.type === "bold"));
  assert.equal(grassetto?.text, "problema", "il titolo non contiene la marcatura inline");
});

// ---- Paragrafi ----

test("paragrafi: riga vuota ne separa, il newline interno resta nel testo", () => {
  const doc = latexToDoc("\\begin{document}\nprimo paragrafo\n\nsecondo paragrafo\nsu due righe\n\\end{document}\n");
  const paragrafi = blocchi(doc, "paragraph");
  assert.equal(paragrafi.length, 2, "la riga vuota non ha separato i paragrafi");
  assert.equal(testoDi(paragrafi[0]?.content), "primo paragrafo");
  assert.equal(testoDi(paragrafi[1]?.content), "secondo paragrafo\nsu due righe");
});

test("escape letterali: \\% \\$ \\_ \\& \\# diventano i caratteri nel testo", () => {
  const doc = latexToDoc("\\begin{document}\n100\\% di \\$5, \\_ \\& \\#\n\\end{document}\n");
  assert.equal(testoDi(blocchi(doc, "paragraph")[0]?.content), "100% di $5, _ & #");
});

test("marcature inline: textbf, emph, textit, underline, texttt e annidamento", () => {
  const doc = latexToDoc(
    "\\begin{document}\n\\textbf{a \\emph{b} c} \\underline{d} \\texttt{e} \\textit{f}\n\\end{document}\n",
  );
  const contenuto = blocchi(doc, "paragraph")[0]?.content ?? [];
  const marcheDi = (t: string) =>
    contenuto.find((n) => n.text === t)?.marks?.map((m) => m.type) ?? [];
  assert.deepEqual(marcheDi("a "), ["bold"], "il testo prima dell'annidamento non è in grassetto");
  assert.deepEqual(marcheDi("b"), ["bold", "italic"], "l'annidamento non è arrivato");
  assert.deepEqual(marcheDi(" c"), ["bold"], "il testo dopo l'annidamento non è in grassetto");
  assert.deepEqual(marcheDi("d"), ["underline"]);
  assert.deepEqual(marcheDi("e"), ["code"]);
  assert.deepEqual(marcheDi("f"), ["italic"]);
});

// ---- Liste ----

test("liste itemize/enumerate annidate con voci modificabili", () => {
  const sorgente = [
    "\\begin{document}",
    "\\begin{itemize}",
    "  \\item primo",
    "  \\item secondo:",
    "    \\begin{enumerate}",
    "      \\item annidato",
    "    \\end{enumerate}",
    "  \\item terzo",
    "\\end{itemize}",
    "\\end{document}\n",
  ].join("\n");
  const doc = latexToDoc(sorgente);
  const lista = blocchi(doc, "bulletList")[0];
  assert.equal(lista?.content?.length, 3, "numero di voci errato");
  assert.equal(testoDi(lista?.content?.[0]?.content?.[0]?.content), "primo");
  const annidata = (lista?.content ?? [])[1]?.content?.find((n) => n.type === "orderedList");
  assert.ok(annidata !== undefined, "la lista annidata non è stata riconosciuta");
  assert.equal(testoDi(annidata?.content?.[0]?.content?.[0]?.content), "annidato");
  assert.equal(testoDi(lista?.content?.[2]?.content?.[0]?.content), "terzo");
});

test("\\item[opzione]: l'intera lista resta un chip verbatim", () => {
  const sorgente = "\\begin{document}\n\\begin{itemize}\n  \\item[punto] voce\n\\end{itemize}\n\\end{document}\n";
  const doc = latexToDoc(sorgente);
  const chip = blocchi(doc, "rawBlock")[0];
  assert.equal(latexDi(chip), "\\begin{itemize}\n  \\item[punto] voce\n\\end{itemize}");
});

test("commento prima del primo \\item: l'intera lista resta un chip", () => {
  const sorgente = "\\begin{document}\n\\begin{itemize}\n  % nota\n  \\item voce\n\\end{itemize}\n\\end{document}\n";
  const doc = latexToDoc(sorgente);
  const chip = blocchi(doc, "rawBlock")[0];
  assert.equal(latexDi(chip), "\\begin{itemize}\n  % nota\n  \\item voce\n\\end{itemize}");
});

test("lista vuota: resta un chip (lo schema esige almeno una voce)", () => {
  const sorgente = "\\begin{document}\n\\begin{itemize}\n\\end{itemize}\n\\end{document}\n";
  const doc = latexToDoc(sorgente);
  assert.equal(blocchi(doc, "rawBlock").length, 1);
  assert.equal(latexDi(blocchi(doc, "rawBlock")[0]), "\\begin{itemize}\n\\end{itemize}");
});

// ---- Citazioni e verbatim ----

test("citazione: blockquote con più paragrafi", () => {
  const sorgente = "\\begin{document}\n\\begin{quote}\nprimo.\n\nsecondo.\n\\end{quote}\n\\end{document}\n";
  const doc = latexToDoc(sorgente);
  const citazione = blocchi(doc, "blockquote")[0];
  const paragrafi = (citazione?.content ?? []).filter((n) => n.type === "paragraph");
  assert.equal(paragrafi.length, 2);
  assert.equal(testoDi(paragrafi[0]?.content), "primo.");
  assert.equal(testoDi(paragrafi[1]?.content), "secondo.");
});

test("verbatim: contenuto esatto, newline inclusi, nessuna interpretazione", () => {
  const sorgente = "\\begin{document}\n\\begin{verbatim}\n$ comando & 100% <raw>\n\\end{verbatim}\n\\end{document}\n";
  const doc = latexToDoc(sorgente);
  const verb = blocchi(doc, "verbatim")[0];
  assert.equal(testoDi(verb?.content), "\n$ comando & 100% <raw>\n");
});

// ---- Chip inline: slice verbatim ----

test("chip inline: matematica, footnote, ref, label, cite e comandi non riconosciuti", () => {
  const sorgente = [
    "\\begin{document}",
    "La formula $E = mc^2$ e \\(a^2\\) con nota\\footnote{testo della nota}",
    "e \\ref{sec:uno} e \\label{par:due} e \\cite{knuth1984} e \\textsc{M1}.",
    "\\end{document}\n",
  ].join("\n");
  const doc = latexToDoc(sorgente);
  const chip = blocchi(doc, "paragraph")[0]?.content?.filter((n) => n.type === "rawInline") ?? [];
  const slice = chip.map(latexDi);
  assert.deepEqual(slice, [
    "$E = mc^2$",
    "\\(a^2\\)",
    "\\footnote{testo della nota}",
    "\\ref{sec:uno}",
    "\\label{par:due}",
    "\\cite{knuth1984}",
    "\\textsc{M1}",
  ]);
  // ogni slice è una sottostringa byte per byte del sorgente
  for (const s of slice) assert.ok(sorgente.includes(s), `la slice ${JSON.stringify(s)} non è verbatim`);
});

test("commento a fine riga: chip inline dentro il paragrafo, posizione preservata", () => {
  const sorgente = "\\begin{document}\nriga uno % nota di revisione\nriga due\n\\end{document}\n";
  const doc = latexToDoc(sorgente);
  const paragrafi = blocchi(doc, "paragraph");
  assert.equal(paragrafi.length, 1, "il newline singolo non deve spezzare il paragrafo");
  const contenuto = paragrafi[0]?.content ?? [];
  assert.deepEqual(
    contenuto.map((n) => (n.type === "rawInline" ? latexDi(n) : n.text)),
    ["riga uno ", "% nota di revisione", "\nriga due"],
  );
});

// ---- Chip blocco: ambienti non supportati ----

test("chip blocco: ambienti non supportati con slice verbatim", () => {
  const sorgente = [
    "\\begin{document}",
    "\\begin{tikzpicture}",
    "  \\draw (0,0) -- (1,1);",
    "\\end{tikzpicture}",
    "\\[",
    "V = \\frac{4}{3}\\pi r^3",
    "\\]",
    "\\begin{center}",
    "centrato",
    "\\end{center}",
    "\\end{document}\n",
  ].join("\n");
  const doc = latexToDoc(sorgente);
  const chip = blocchi(doc, "rawBlock").map(latexDi);
  assert.deepEqual(chip, [
    "\\begin{tikzpicture}\n  \\draw (0,0) -- (1,1);\n\\end{tikzpicture}",
    "\\[\nV = \\frac{4}{3}\\pi r^3\n\\]",
    "\\begin{center}\ncentrato\n\\end{center}",
  ]);
});

test("commento isolato fra i paragrafi: chip di blocco verbatim", () => {
  const sorgente = "\\begin{document}\nprimo.\n\n% commento isolato\n\nsecondo.\n\\end{document}\n";
  const doc = latexToDoc(sorgente);
  const chip = blocchi(doc, "rawBlock")[0];
  assert.equal(latexDi(chip), "% commento isolato");
  assert.equal(blocchi(doc, "paragraph").length, 2);
});

test("equation e align: chip di blocco con l'ambiente intero", () => {
  const sorgente = [
    "\\begin{document}",
    "\\begin{equation}",
    "E = mc^2 \\label{eq:emc}",
    "\\end{equation}",
    "\\begin{align}",
    "a &= b \\\\",
    "d &= e",
    "\\end{align}",
    "\\end{document}\n",
  ].join("\n");
  const doc = latexToDoc(sorgente);
  const chip = blocchi(doc, "rawBlock").map(latexDi);
  assert.deepEqual(chip, [
    "\\begin{equation}\nE = mc^2 \\label{eq:emc}\n\\end{equation}",
    "\\begin{align}\na &= b \\\\\nd &= e\n\\end{align}",
  ]);
});

// ---- Sulla fixture: i costrutti chiave ci sono tutti ----

test("fixture: il documento contiene tutte le strutture del subset e i chip attesi", () => {
  const doc = latexToDoc(FIXTURE);
  assert.ok(blocchi(doc, "heading").length >= 8, "titoli insufficienti");
  assert.ok(blocchi(doc, "bulletList").length >= 2, "liste puntate insufficienti");
  assert.ok(blocchi(doc, "orderedList").length >= 2, "liste numerate insufficienti");
  assert.ok(blocchi(doc, "blockquote").length >= 1, "citazione mancante");
  assert.ok(blocchi(doc, "verbatim").length >= 1, "verbatim mancante");
  assert.ok(blocchi(doc, "rawBlock").length >= 10, "chip di blocco insufficienti");
  assert.ok(primoNodo(doc, "rawInline") !== undefined, "chip inline mancante");

  // il chip tikzpicture della fixture è la slice esatta del sorgente
  const tikz = blocchi(doc, "rawBlock").find((b) => latexDi(b).startsWith("\\begin{tikzpicture}"));
  const inizio = FIXTURE.indexOf("\\begin{tikzpicture}");
  const fine = FIXTURE.indexOf("\\end{tikzpicture}") + "\\end{tikzpicture}".length;
  assert.equal(latexDi(tikz), FIXTURE.slice(inizio, fine), "la slice tikzpicture non è verbatim");
});

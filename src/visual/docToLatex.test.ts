/**
 * M1 — Test del serialize (docToLatex) e del round-trip completo.
 *
 * TRE proprietà inchiodate:
 *   1. GOLDEN: per ogni costrutto del subset, input → output atteso ESPLICITO
 *      (la forma canonica del serializzatore è documentata qui, riga per riga).
 *   2. PRESERVAZIONE: le slice dei chip (tikzpicture, equation, \footnote,
 *      $...$, \newcommand nel preambolo, …) sono IDENTITICHE byte per byte
 *      alle originali, prima e dopo il round-trip. Un'implementazione naive
 *      che droppa o riscrive i chip è ROSSA qui.
 *   3. IDEMPOTENZA: serialize(parse(serialize(parse(s)))) === serialize(parse(s)):
 *      la forma canonica è un punto fisso.
 *
 * Si esegue con `npm test` (node --test --experimental-strip-types).
 */
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { collectRawSlices, docToLatex } from "./docToLatex.ts";
import { latexToDoc } from "./latexToDoc.ts";

const FIXTURE = readFileSync(new URL("./fixtures/documento.tex", import.meta.url), "utf8");

/** Round-trip: sorgente → documento → sorgente. */
function rt(sorgente: string): string {
  return docToLatex(latexToDoc(sorgente));
}

/** Documento con soli preambolo+corpo+coda minimi attorno a `corpo`. */
function conDocumento(corpo: string): string {
  return "pre\n\\begin{document}\n" + corpo + "\\end{document}\ncoda\n";
}

// ---- 1. GOLDEN: un caso esplicito per ogni costrutto del subset ----

const GOLDEN: Array<{ nome: string; sorgente: string; atteso: string }> = [
  {
    nome: "paragrafo singolo",
    sorgente: conDocumento("un paragrafo\n"),
    atteso: "pre\n\\begin{document}\nun paragrafo\n\\end{document}\ncoda\n",
  },
  {
    nome: "due paragrafi separati da riga vuota",
    sorgente: conDocumento("primo.\n\nsecondo.\n"),
    atteso: conDocumento("primo.\n\nsecondo.\n"),
  },
  {
    nome: "newline interno al paragrafo (resta nel testo)",
    sorgente: conDocumento("riga uno\nriga due\n"),
    atteso: conDocumento("riga uno\nriga due\n"),
  },
  {
    nome: "sezioni e sottosezioni, anche stellate",
    sorgente: conDocumento("\\section{A}\n\n\\subsection{B}\n\n\\subsubsection*{C}\n\ntesto\n"),
    atteso: conDocumento("\\section{A}\n\n\\subsection{B}\n\n\\subsubsection*{C}\n\ntesto\n"),
  },
  {
    nome: "marcature inline e annidamento",
    sorgente: conDocumento("\\textbf{a \\emph{b} c} e \\underline{d} e \\texttt{e}\n"),
    atteso: conDocumento("\\textbf{a \\emph{b} c} e \\underline{d} e \\texttt{e}\n"),
  },
  {
    nome: "escape letterali",
    sorgente: conDocumento("100\\% e \\$5 e \\# e \\_ e \\&\n"),
    atteso: conDocumento("100\\% e \\$5 e \\# e \\_ e \\&\n"),
  },
  {
    nome: "tilde: resta se stesso (spazio unibreak LaTeX valido)",
    sorgente: conDocumento("Sezione~2 resta tale\n"),
    atteso: conDocumento("Sezione~2 resta tale\n"),
  },
  {
    nome: "liste annidate: indentazione 2 spazi per livello",
    sorgente: conDocumento(
      "\\begin{itemize}\n  \\item primo\n  \\item secondo:\n    \\begin{enumerate}\n      \\item dentro\n    \\end{enumerate}\n  \\item terzo\n\\end{itemize}\n",
    ),
    atteso: conDocumento(
      "\\begin{itemize}\n  \\item primo\n  \\item secondo:\n    \\begin{enumerate}\n      \\item dentro\n    \\end{enumerate}\n  \\item terzo\n\\end{itemize}\n",
    ),
  },
  {
    nome: "voce di lista con più paragrafi",
    sorgente: conDocumento("\\begin{itemize}\n  \\item primo paragrafo\n\n  secondo paragrafo\n\\end{itemize}\n"),
    atteso: conDocumento("\\begin{itemize}\n  \\item primo paragrafo\n\n  secondo paragrafo\n\\end{itemize}\n"),
  },
  {
    nome: "citazione con più paragrafi",
    sorgente: conDocumento("\\begin{quote}\nprimo.\n\nsecondo.\n\\end{quote}\n"),
    atteso: conDocumento("\\begin{quote}\nprimo.\n\nsecondo.\n\\end{quote}\n"),
  },
  {
    nome: "verbatim: byte per byte, nessuna interpretazione",
    sorgente: conDocumento("\\begin{verbatim}\n$ cmd & 100% <raw>\n\\end{verbatim}\n"),
    atteso: conDocumento("\\begin{verbatim}\n$ cmd & 100% <raw>\n\\end{verbatim}\n"),
  },
  {
    nome: "chip inline: matematica e comandi non riconosciuti",
    sorgente: conDocumento("formula $x^2$ e \\(y\\) e \\footnote{nota} e \\ref{r} e \\textsc{M1}\n"),
    atteso: conDocumento("formula $x^2$ e \\(y\\) e \\footnote{nota} e \\ref{r} e \\textsc{M1}\n"),
  },
  {
    nome: "chip blocco: ambienti non supportati e display math",
    sorgente: conDocumento(
      "\\begin{tikzpicture}\n  \\draw (0,0);\n\\end{tikzpicture}\n\n\\[x = y\\]\n\n\\begin{center}\nc\n\\end{center}\n",
    ),
    atteso: conDocumento(
      "\\begin{tikzpicture}\n  \\draw (0,0);\n\\end{tikzpicture}\n\n\\[x = y\\]\n\n\\begin{center}\nc\n\\end{center}\n",
    ),
  },
  {
    nome: "commento isolato: chip di blocco",
    sorgente: conDocumento("primo.\n\n% commento isolato\n\nsecondo.\n"),
    atteso: conDocumento("primo.\n\n% commento isolato\n\nsecondo.\n"),
  },
  {
    nome: "commento a fine riga: chip inline, il newline resta nel testo",
    sorgente: conDocumento("riga uno % nota\nriga due\n"),
    atteso: conDocumento("riga uno % nota\nriga due\n"),
  },
  {
    nome: "preambolo con \\newcommand e coda: slice verbatim",
    sorgente: "% testa\n\\newcommand{\\x}{y}\n\\begin{document}\ntesto\n\\end{document}\n% coda\n",
    atteso: "% testa\n\\newcommand{\\x}{y}\n\\begin{document}\ntesto\n\\end{document}\n% coda\n",
  },
  {
    nome: "frammento senza \\begin{document}: identità",
    sorgente: "\\newcommand{\\x}{y}\n% solo preambolo\n",
    atteso: "\\newcommand{\\x}{y}\n% solo preambolo\n",
  },
];

for (const g of GOLDEN) {
  test(`golden: ${g.nome}`, () => {
    assert.equal(rt(g.sorgente), g.atteso);
  });
}

// ---- Normalizzazioni dichiarate (input non canonico → forma canonica) ----

const NORMALIZZAZIONI: Array<{ nome: string; sorgente: string; atteso: string }> = [
  {
    nome: "\\textit normalizzato in \\emph (forma canonica del corsivo)",
    sorgente: conDocumento("testo \\textit{corsivo} normale\n"),
    atteso: conDocumento("testo \\emph{corsivo} normale\n"),
  },
  {
    nome: "newline singolo fra titolo e testo → riga vuota",
    sorgente: conDocumento("\\section{A}\ntesto\n"),
    atteso: conDocumento("\\section{A}\n\ntesto\n"),
  },
  {
    nome: "righe vuote multiple → una sola",
    sorgente: conDocumento("a\n\n\n\nb\n"),
    atteso: conDocumento("a\n\nb\n"),
  },
  {
    nome: "spazio prima dell'argomento del titolo → via",
    sorgente: conDocumento("\\section {A}\n\ntesto\n"),
    atteso: conDocumento("\\section{A}\n\ntesto\n"),
  },
  {
    nome: "fine riga CRLF: i paragrafi si spezzano e l'output è LF",
    sorgente: "pre\r\n\\begin{document}\r\na\r\n\r\nb\r\n\\end{document}\r\n",
    atteso: "pre\r\n\\begin{document}\na\n\nb\n\\end{document}\r\n",
  },
];

for (const n of NORMALIZZAZIONI) {
  test(`normalizzazione: ${n.nome}`, () => {
    assert.equal(rt(n.sorgente), n.atteso);
  });
}

// ---- 2. PRESERVAZIONE: le slice dei chip sono byte per byte le originali ----

test("preservazione: ogni slice di chip della fixture è una sottostringa byte per byte del sorgente", () => {
  const doc = latexToDoc(FIXTURE);
  const slice = collectRawSlices(doc);
  assert.ok(slice.length >= 25, `troppi pochi chip (${slice.length}) per essere la fixture completa`);
  for (const s of slice) {
    assert.ok(
      typeof s === "string" && s.length > 0 && FIXTURE.includes(s),
      `la slice ${JSON.stringify(s.slice(0, 60))} non è una sottostringa byte per byte del sorgente`,
    );
  }
});

test("preservazione: tikzpicture, equation, align, footnote, $...$ e \\newcommand sopravvivono identici", () => {
  const uscita = rt(FIXTURE);
  const estratte = [
    "\\begin{tikzpicture}[scale=1.0]\n  \\draw[thick] (0,0) rectangle (3,2);\n  \\node at (1.5,1) {Editor};\n\\end{tikzpicture}",
    "\\begin{equation}\nE = mc^2 \\label{eq:emc}\n\\end{equation}",
    "\\begin{align}\na &= b + c \\\\\nd &= e + f \\nonumber\n\\end{align}",
    "\\[\nV = \\frac{4}{3}\\pi r^3\n\\]",
    "\\footnote{Le note non sono\nmodificabili nella vista visuale V1.}",
    "$E = mc^2$",
    "$x_i^2$",
    "\\newcommand{\\sigla}[1]{\\textsc{#1}}",
    "\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.7\\textwidth]{grafico.pdf}\n  \\caption{Un grafico di esempio con label.}\n  \\label{fig:grafico}\n\\end{figure}",
    "\\begin{description}\n  \\item[WYSIWYM] What You See Is What You Mean.\n  \\item[Chip] porzione di sorgente mostrata grezza e non modificabile.\n\\end{description}",
  ];
  for (const s of estratte) {
    assert.ok(FIXTURE.includes(s), `l'atteso non è nel sorgente: ${JSON.stringify(s.slice(0, 50))}`);
    assert.ok(uscita.includes(s), `la slice è stata alterata o persa: ${JSON.stringify(s.slice(0, 50))}`);
  }
});

test("preservazione: il set di chip è IDENTICO prima e dopo il round-trip (nessuno perso, nessuno riscritto)", () => {
  const prima = collectRawSlices(latexToDoc(FIXTURE));
  const dopo = collectRawSlices(latexToDoc(rt(FIXTURE)));
  assert.deepEqual(dopo, prima, "il round-trip ha perso o riscritto anche una sola slice");
});

// ---- 3. IDEMPOTENZA: la forma canonica è un punto fisso ----

test("idempotenza: sulla fixture (197 righe) la seconda passata non cambia nulla", () => {
  const primaPassata = rt(FIXTURE);
  assert.equal(primaPassata, FIXTURE, "il round-trip della fixture non è un'identità byte per byte");
  assert.equal(rt(primaPassata), primaPassata, "la seconda passata ha cambiato il documento");
});

test("idempotenza: su ogni input golden e normalizzato", () => {
  const input = [...GOLDEN, ...NORMALIZZAZIONI].map((c) => c.sorgente);
  input.push(FIXTURE);
  input.push(FIXTURE.replace(/\n/g, "\r\n"));
  input.push("\\begin{document}\n\\section{A}\ntesto\n\\end{document}\n");
  for (const sorgente of input) {
    const primaPassata = rt(sorgente);
    assert.equal(rt(primaPassata), primaPassata, `non idempotente su: ${JSON.stringify(sorgente.slice(0, 60))}`);
  }
});

// ---- Il round-trip del chip digitato nella vista visuale ----

test("caratteri speciali digitati nella vista visuale: il serialize li rende LaTeX compilabile", () => {
  // testo con caratteri che non possono arrivare dal parse (il lexer li rende
  // comandi/chip): simulano l'utente che li digita in modalità visuale.
  const doc = {
    type: "doc",
    content: [
      { type: "preamble", attrs: { latex: "" } },
      {
        type: "paragraph",
        content: [{ type: "text", text: "100% di {a} e $var e b\\c e x^y" }],
      },
      { type: "postamble", attrs: { latex: "" } },
    ],
  };
  assert.equal(
    docToLatex(doc),
    "\\begin{document}\n100\\% di \\{a\\} e \\$var e b\\textbackslash{}c e x\\textasciicircum{}y\n\\end{document}",
  );
});

/**
 * M2 — Test del motore matematico: estrazione e rendering KaTeX.
 *
 * Ogni test inchioda:
 *   - GOLDEN di estrazione: per ogni forma matematica che può arrivare come
 *     slice di chip ($...$, \(...\), $$...$$, \[...\], ambienti amsmath con e
 *     senza stellina) il TeX estratto è ESPLICITO, con le normalizzazioni
 *     dichiarate (delimitatori via, \label via, bordi ripuliti);
 *   - NON-MATEMATICA: footnote, ref, cite, label, comandi non riconosciuti,
 *     tikzpicture, center, figure, tabular, commenti → null: restano chip;
 *   - RENDER tipizzato: HTML con la struttura katex attesa, oppure errore
 *     tipizzato — MAI un'eccezione, nemmeno su TeX rotto;
 *   - FIXTURE: tutti i chip matematici del documento realistico si rendono.
 *
 * Le varianti naive che passano a KaTeX la slice intera coi delimitatori, o
 * che trattano come matematica qualunque comando, sono rosse su questi test.
 *
 * Si esegue con `npm test` (node --test --experimental-strip-types).
 */
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { estraiMatematica, renderMatematica } from "./math.ts";
import { latexToDoc } from "./latexToDoc.ts";
import type { DocJson } from "./schema.ts";

const FIXTURE = readFileSync(new URL("./fixtures/documento.tex", import.meta.url), "utf8").replace(
  /\r\n/g,
  "\n",
);

// ---- 1. GOLDEN di estrazione: la copia di rendering è esplicita ----

const GOLDEN: Array<{ nome: string; slice: string; atteso: { tex: string; display: boolean } | null }> = [
  {
    nome: "matematica inline con $: delimitatori via",
    slice: "$E = mc^2$",
    atteso: { tex: "E = mc^2", display: false },
  },
  {
    nome: "matematica inline con \\(...\\): delimitatori via",
    slice: "\\(a^2 + b^2 = c^2\\)",
    atteso: { tex: "a^2 + b^2 = c^2", display: false },
  },
  {
    nome: "inline con pedici e apici",
    slice: "$x_i^2$",
    atteso: { tex: "x_i^2", display: false },
  },
  {
    nome: "inline su più righe: i bordi si ripuliscono, il newline interno resta",
    slice: "$a\nb$",
    atteso: { tex: "a\nb", display: false },
  },
  {
    nome: "display con $$: delimitatori via",
    slice: "$$w$$",
    atteso: { tex: "w", display: true },
  },
  {
    nome: "display con \\[...\\] su più righe: delimitatori via, bordi ripuliti",
    slice: "\\[\nV = \\frac{4}{3}\\pi r^3\n\\]",
    atteso: { tex: "V = \\frac{4}{3}\\pi r^3", display: true },
  },
  {
    nome: "equation: ambiente intero, \\label via dalla copia di rendering",
    slice: "\\begin{equation}\nE = mc^2 \\label{eq:emc}\n\\end{equation}",
    atteso: { tex: "\\begin{equation}\nE = mc^2 \n\\end{equation}", display: true },
  },
  {
    nome: "align: ambiente intero, allineamenti e righe intatti, \\nonumber resta (KaTeX lo capisce)",
    slice: "\\begin{align}\na &= b + c \\\\\nd &= e + f \\nonumber\n\\end{align}",
    atteso: {
      tex: "\\begin{align}\na &= b + c \\\\\nd &= e + f \\nonumber\n\\end{align}",
      display: true,
    },
  },
  {
    nome: "equation* stellata: riconosciuta e resa",
    slice: "\\begin{equation*}\nq = mc^2\n\\end{equation*}",
    atteso: { tex: "\\begin{equation*}\nq = mc^2\n\\end{equation*}", display: true },
  },
  {
    nome: "align* stellata",
    slice: "\\begin{align*}a &= b\\end{align*}",
    atteso: { tex: "\\begin{align*}a &= b\\end{align*}", display: true },
  },
  {
    nome: "gather e gather*",
    slice: "\\begin{gather}a \\\\ b\\end{gather}",
    atteso: { tex: "\\begin{gather}a \\\\ b\\end{gather}", display: true },
  },
  {
    nome: "multline",
    slice: "\\begin{multline}a \\\\ b\\end{multline}",
    atteso: { tex: "\\begin{multline}a \\\\ b\\end{multline}", display: true },
  },
  {
    nome: "flalign",
    slice: "\\begin{flalign}a &= b\\end{flalign}",
    atteso: { tex: "\\begin{flalign}a &= b\\end{flalign}", display: true },
  },
  {
    nome: "alignat col suo argomento di colonna",
    slice: "\\begin{alignat}{2}a &= b & c &= d\\end{alignat}",
    atteso: { tex: "\\begin{alignat}{2}a &= b & c &= d\\end{alignat}", display: true },
  },
  {
    nome: "\\label dentro la matematica inline: via dalla copia di rendering",
    slice: "$x \\label{p:x}$",
    atteso: { tex: "x", display: false },
  },
  {
    nome: "$$ vuota: non è matematica da rendere",
    slice: "$$",
    atteso: null,
  },
  {
    nome: "$ $ (solo spazio): non è matematica da rendere",
    slice: "$ $",
    atteso: null,
  },
  {
    nome: "\\[\\] vuota: non è matematica da rendere",
    slice: "\\[\\]",
    atteso: null,
  },
];

for (const g of GOLDEN) {
  test(`golden estrazione: ${g.nome}`, () => {
    assert.deepEqual(estraiMatematica(g.slice), g.atteso);
  });
}

// ---- 2. NON-MATEMATICA: tutto il resto resta chip grezzo ----

const NON_MATEMATICA = [
  "\\footnote{Le note non sono modificabili}",
  "\\ref{sec:liste}",
  "\\label{par:due}",
  "\\cite{knuth1984}",
  "\\textsc{M1}",
  "\\sigla{WYSIWYM}",
  "\\LaTeX",
  "% commento isolato",
  "% nota di revisione",
  "\\begin{tikzpicture}[scale=1.0]\n  \\draw[thick] (0,0) rectangle (3,2);\n\\end{tikzpicture}",
  "\\begin{center}\ncentrato\n\\end{center}",
  "\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics{x.pdf}\n\\end{figure}",
  "\\begin{tabular}{lr}\n  a & b \\\\\n\\end{tabular}",
  "\\begin{itemize}\n  \\item[punto] voce\n\\end{itemize}",
  "\\begin{description}\n  \\item[WYSIWYM] cosa.\n\\end{description}",
];

for (const slice of NON_MATEMATICA) {
  test(`non matematica → chip grezzo: ${JSON.stringify(slice.slice(0, 40))}`, () => {
    assert.equal(estraiMatematica(slice), null);
  });
}

// ---- 3. RENDER tipizzato: HTML con struttura attesa, o errore, mai eccezioni ----

test("render inline: HTML con la struttura katex, senza blocco display", () => {
  const esito = renderMatematica("E = mc^2", false);
  assert.ok("html" in esito, "il render è fallito");
  assert.ok(esito.html.includes('class="katex"'), "manca la struttura katex");
  assert.ok(!esito.html.includes("katex-display"), "inline non deve essere display");
});

test("render display: HTML col blocco katex-display", () => {
  const esito = renderMatematica("V = \\frac{4}{3}\\pi r^3", true);
  assert.ok("html" in esito, "il render è fallito");
  assert.ok(esito.html.includes("katex-display"), "manca il blocco display");
});

test("render ambienti completi: align e equation passano tale e quale", () => {
  const align = renderMatematica("\\begin{align}\na &= b + c \\\\\nd &= e + f \\nonumber\n\\end{align}", true);
  assert.ok("html" in align, "align non si rende");
  const equation = renderMatematica("\\begin{equation}\nE = mc^2 \n\\end{equation}", true);
  assert.ok("html" in equation, "equation non si rende");
});

test("render di TeX rotto: errore tipizzato, MAI un'eccezione", () => {
  assert.ok("errore" in renderMatematica("\\sconosciuto{x}", false), "atteso errore tipizzato");
  assert.ok("errore" in renderMatematica("\\begin{equation}\\ignoto\\end{equation}", true), "atteso errore tipizzato");
  // Il messaggio di KaTeX arriva integro: dice cosa e dove.
  const esito = renderMatematica("\\sconosciuto{x}", false);
  if ("errore" in esito) assert.ok(esito.errore.includes("KaTeX parse error"));
});

// ---- 4. FIXTURE: tutti i chip matematici del documento realistico ----

/** Chip (inline e blocco) del documento, nell'ordine, con la slice verbatim. */
function chipDelDoc(doc: DocJson): Array<{ tipo: string; latex: string }> {
  const chip: Array<{ tipo: string; latex: string }> = [];
  const visita = (nodi: DocJson[] | undefined): void => {
    for (const n of nodi ?? []) {
      if (n.type === "rawInline" || n.type === "rawBlock") {
        chip.push({ tipo: n.type, latex: typeof n.attrs?.latex === "string" ? n.attrs.latex : "" });
      }
      visita(n.content);
    }
  };
  visita(doc.content);
  return chip;
}

test("fixture: i chip matematici sono esattamente i sette attesi, tutti display/inline corretti", () => {
  const chip = chipDelDoc(latexToDoc(FIXTURE));
  const matematici = chip.filter((c) => estraiMatematica(c.latex) !== null);
  assert.equal(matematici.length, 7, `attesi 7 chip matematici, trovati ${matematici.length}`);
  assert.deepEqual(
    matematici.map((c) => c.tipo),
    ["rawInline", "rawInline", "rawInline", "rawInline", "rawBlock", "rawBlock", "rawBlock"],
  );
  for (const c of matematici) {
    const m = estraiMatematica(c.latex);
    assert.ok(m !== null);
    assert.equal(m.display, c.tipo === "rawBlock", "un chip di blocco deve essere display e viceversa");
  }
});

test("fixture: ogni chip matematico si rende in HTML, nessuna eccezione, la slice resta se stessa", () => {
  const chip = chipDelDoc(latexToDoc(FIXTURE));
  for (const c of chip) {
    const m = estraiMatematica(c.latex);
    if (m === null) continue; // chip grezzo: rendering non c'entra
    const esito = renderMatematica(m.tex, m.display);
    assert.ok("html" in esito, `il chip ${JSON.stringify(c.latex.slice(0, 40))} non si rende`);
    assert.ok(esito.html.includes('class="katex"'), "l'HTML non ha la struttura katex");
    // La slice del chip resta byte per byte nel sorgente: il rendering non
    // ha toccato niente (la copia di rendering è un'altra stringa).
    assert.ok(FIXTURE.includes(c.latex), "la slice non è più verbatim");
  }
});

import { useState } from "react";
import { useStore } from "../state/store";
import {
  latexChipLabel,
  latexToolRows,
  latexGuidance,
  type LatexChipTone,
} from "../latex/latexStatusUi.ts";
import styles from "../styles/layout.module.css";

/**
 * M0.7.1 — la rilevazione strumenti è VISIBILE senza click: chip nella barra
 * di stato, cliccabile per il dettaglio completo (sei tool con ✓/✗, versione,
 * «Rileggi», testo guida se la distribuzione manca). La rilevazione parte
 * all'avvio (bootstrap) e su «Rileggi»: mai polling in background.
 */
export function LatexChip() {
  const latex = useStore((s) => s.latex);
  const [open, setOpen] = useState(false);
  const label = latexChipLabel(latex);

  return (
    <span className={styles.latexChipWrap}>
      <button
        type="button"
        className={`${styles.latexChip} ${toneClass(label.tone)}`}
        onClick={() => setOpen((v) => !v)}
        title="Strumenti LaTeX rilevati — clicca per il dettaglio"
        aria-expanded={open}
      >
        <span className={`${styles.dot} ${dotClass(label.tone)}`} />
        {label.text}
      </button>
      {open && <LatexDetail onClose={() => setOpen(false)} />}
    </span>
  );
}

function toneClass(tone: LatexChipTone): string {
  return tone === "ok"
    ? styles.latexChipOk
    : tone === "warn"
      ? styles.latexChipWarn
      : tone === "bad"
        ? styles.latexChipBad
        : styles.latexChipIdle;
}

function dotClass(tone: LatexChipTone): string {
  return tone === "ok"
    ? styles.dotGreen
    : tone === "warn"
      ? styles.dotYellow
      : tone === "bad"
        ? styles.dotRed
        : styles.dotIdle;
}

/** Dettaglio a comparsa sopra la barra di stato. */
function LatexDetail({ onClose }: { onClose: () => void }) {
  const latex = useStore((s) => s.latex);
  const rows = latexToolRows(latex);
  const guidance = latexGuidance(latex);

  return (
    <div className={styles.latexDetail} role="dialog" aria-label="Strumenti LaTeX rilevati">
      <div className={styles.latexDetailHeader}>
        <strong>Strumenti LaTeX rilevati</strong>
        <button type="button" className={styles.latexCloseBtn} onClick={onClose}>
          Chiudi
        </button>
      </div>
      <ul className={styles.latexToolList}>
        {rows.map((r) => (
          <li key={r.name} className={styles.latexToolRow} title={r.version || undefined}>
            <span className={r.available ? styles.latexToolOk : styles.latexToolBad}>
              {r.available ? "✓" : "✗"}
            </span>
            <span>{r.name}</span>
            {r.available && r.version && (
              <span className={styles.latexToolVersion}>{r.version}</span>
            )}
          </li>
        ))}
      </ul>
      {guidance && <p className={styles.latexGuidance}>{guidance}</p>}
      <div className={styles.latexDetailActions}>
        <button
          type="button"
          className={styles.btn}
          onClick={() => useStore.getState().detectLatex()}
        >
          Rileggi
        </button>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import type { Engine } from "../types";
import styles from "../styles/layout.module.css";

export function SettingsDialog() {
  const open = useStore((s) => s.settingsOpen);
  const settings = useStore((s) => s.settings);
  const [draft, setDraft] = useState(settings);

  useEffect(() => {
    setDraft(settings);
  }, [settings, open]);

  if (!open) return null;

  const save = () => {
    useStore.getState().updateSettings(draft);
    useStore.getState().setSettingsOpen(false);
  };

  return (
    <div className={styles.overlay} onClick={() => useStore.getState().setSettingsOpen(false)}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h2>Impostazioni progetto</h2>

        <label className={styles.field}>
          File principale
          <input
            value={draft.mainFile}
            onChange={(e) => setDraft({ ...draft, mainFile: e.target.value })}
            placeholder="main.tex"
          />
        </label>

        <label className={styles.field}>
          Motore di compilazione
          <select
            value={draft.engine}
            onChange={(e) => setDraft({ ...draft, engine: e.target.value as Engine })}
          >
            <option value="pdflatex">pdflatex</option>
            <option value="xelatex">xelatex</option>
            <option value="lualatex">lualatex</option>
          </select>
        </label>

        <label className={styles.fieldCheckbox}>
          <input
            type="checkbox"
            checked={draft.shellEscape}
            onChange={(e) => setDraft({ ...draft, shellEscape: e.target.checked })}
          />
          Consenti <code>-shell-escape</code> (necessario solo per pacchetti
          speciali; disattivato per sicurezza)
        </label>

        <label className={styles.fieldCheckbox}>
          <input
            type="checkbox"
            checked={draft.autoSave}
            onChange={(e) => setDraft({ ...draft, autoSave: e.target.checked })}
          />
          Salvataggio automatico dopo una breve pausa nella digitazione
        </label>

        <label className={styles.fieldCheckbox}>
          <input
            type="checkbox"
            checked={draft.autoBuild}
            onChange={(e) => setDraft({ ...draft, autoBuild: e.target.checked })}
          />
          Ricompila automaticamente quando salvi il file principale
        </label>

        <label className={styles.field}>
          Dimensione carattere dell'editor (px)
          <input
            type="number"
            min={10}
            max={24}
            value={draft.fontSize}
            onChange={(e) =>
              setDraft({ ...draft, fontSize: Number(e.target.value) || 13.5 })
            }
          />
        </label>

        <div className={styles.dialogActions}>
          <button className={styles.btn} onClick={() => useStore.getState().setSettingsOpen(false)}>
            Annulla
          </button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={save}>
            Salva
          </button>
        </div>
      </div>
    </div>
  );
}

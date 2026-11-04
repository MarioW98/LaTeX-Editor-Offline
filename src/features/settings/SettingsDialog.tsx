// Settings dialog: global (editor/appearance) + per-project (build) settings,
// LaTeX detection with install guidance, shell-escape warning.

import { useState } from "react";

import { useAppStore } from "../../state/store";
import type { GlobalSettings, ProjectSettings } from "../../types";

function SettingsDialog(): JSX.Element {
  const setUi = useAppStore((s) => s.setUi);
  const globalSettings = useAppStore((s) => s.globalSettings);
  const projectSettings = useAppStore((s) => s.projectSettings);
  const projectRoot = useAppStore((s) => s.projectRoot);
  const latex = useAppStore((s) => s.latex);
  const detectLatex = useAppStore((s) => s.detectLatex);
  const updateGlobalSettings = useAppStore((s) => s.updateGlobalSettings);
  const updateProjectSettings = useAppStore((s) => s.updateProjectSettings);

  const [globalDraft, setGlobalDraft] = useState<GlobalSettings>(globalSettings);
  const [projectDraft, setProjectDraft] = useState<ProjectSettings>(projectSettings);

  const close = (): void => setUi({ settingsOpen: false });

  const save = (): void => {
    void updateGlobalSettings({
      theme: globalDraft.theme,
      fontSize: globalDraft.fontSize,
      wordWrap: globalDraft.wordWrap,
      defaultEngine: globalDraft.defaultEngine,
      autosaveEnabled: globalDraft.autosaveEnabled,
      autosaveDelayMs: globalDraft.autosaveDelayMs,
      latexPathOverride: globalDraft.latexPathOverride,
    });
    void updateProjectSettings({
      mainFile: projectDraft.mainFile,
      engine: projectDraft.engine,
      outputDir: projectDraft.outputDir,
      useLatexmk: projectDraft.useLatexmk,
      shellEscape: projectDraft.shellEscape,
    });
    close();
  };

  const setGlobal = (patch: Partial<GlobalSettings>): void =>
    setGlobalDraft((g) => ({ ...g, ...patch }));
  const setProject = (patch: Partial<ProjectSettings>): void =>
    setProjectDraft((p) => ({ ...p, ...patch }));

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal" role="dialog" aria-modal={true} aria-label="Impostazioni">
        <h3>Impostazioni</h3>

        <div className="form-section">Editor (globali)</div>
        <div className="form-row">
          <label htmlFor="s-theme">Tema</label>
          <select
            id="s-theme"
            value={globalDraft.theme}
            onChange={(e) => setGlobal({ theme: e.target.value as GlobalSettings["theme"] })}
          >
            <option value="dark">Scuro</option>
            <option value="light">Chiaro</option>
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="s-font">Dimensione carattere (px)</label>
          <input
            id="s-font"
            type="number"
            min={10}
            max={28}
            value={globalDraft.fontSize}
            onChange={(e) => setGlobal({ fontSize: Math.max(10, Math.min(28, Number(e.target.value) || 14)) })}
          />
        </div>
        <div className="form-row">
          <label htmlFor="s-wrap">Ritorno a capo automatico</label>
          <input
            id="s-wrap"
            type="checkbox"
            checked={globalDraft.wordWrap}
            onChange={(e) => setGlobal({ wordWrap: e.target.checked })}
          />
        </div>
        <div className="form-row">
          <label htmlFor="s-as">Salvataggio automatico</label>
          <input
            id="s-as"
            type="checkbox"
            checked={globalDraft.autosaveEnabled}
            onChange={(e) => setGlobal({ autosaveEnabled: e.target.checked })}
          />
        </div>
        <div className="form-row">
          <label htmlFor="s-asd">Ritardo autosave (ms)</label>
          <input
            id="s-asd"
            type="number"
            min={250}
            max={60000}
            step={250}
            value={globalDraft.autosaveDelayMs}
            disabled={!globalDraft.autosaveEnabled}
            onChange={(e) => setGlobal({ autosaveDelayMs: Math.max(250, Math.min(60000, Number(e.target.value) || 1500)) })}
          />
        </div>

        <div className="form-section">Compilazione (progetto)</div>
        <div className="form-row">
          <label htmlFor="s-main">File principale</label>
          <input
            id="s-main"
            type="text"
            value={projectDraft.mainFile}
            placeholder="main.tex"
            disabled={!projectRoot}
            onChange={(e) => setProject({ mainFile: e.target.value })}
          />
        </div>
        <div className="form-row">
          <label htmlFor="s-engine">Motore</label>
          <select
            id="s-engine"
            value={projectDraft.engine}
            disabled={!projectRoot}
            onChange={(e) => setProject({ engine: e.target.value })}
          >
            <option value="pdflatex">pdflatex</option>
            <option value="xelatex">xelatex</option>
            <option value="lualatex">lualatex</option>
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="s-outdir">Cartella di output</label>
          <input
            id="s-outdir"
            type="text"
            value={projectDraft.outputDir}
            disabled={!projectRoot}
            onChange={(e) => setProject({ outputDir: e.target.value })}
          />
        </div>
        <div className="form-row">
          <label htmlFor="s-lmk">Usa latexmk se disponibile</label>
          <input
            id="s-lmk"
            type="checkbox"
            checked={projectDraft.useLatexmk}
            disabled={!projectRoot}
            onChange={(e) => setProject({ useLatexmk: e.target.checked })}
          />
        </div>
        <div className="form-row">
          <label htmlFor="s-shesc">Consenti -shell-escape</label>
          <input
            id="s-shesc"
            type="checkbox"
            checked={projectDraft.shellEscape}
            disabled={!projectRoot}
            onChange={(e) => setProject({ shellEscape: e.target.checked })}
          />
        </div>
        {projectDraft.shellEscape && (
          <p className="dialog-hint warn-text">
            Attenzione: -shell-escape consente a LaTeX di eseguire comandi esterni durante la
            compilazione. Attivalo solo se un pacchetto lo richiede davvero e solo su progetti
            fidati.
          </p>
        )}

        <div className="form-section">LaTeX (globali)</div>
        <div className="form-row">
          <label htmlFor="s-path">Cartella LaTeX aggiuntiva</label>
          <input
            id="s-path"
            type="text"
            value={globalDraft.latexPathOverride ?? ""}
            placeholder="opzionale: percorso con pdflatex/latexmk"
            onChange={(e) => setGlobal({ latexPathOverride: e.target.value || null })}
          />
        </div>
        <div className="form-row">
          <label>Stato installazione</label>
          <div>
            {latex ? (
              latex.found ? (
                <span>
                  Rilevato: {latex.distribution ?? "LaTeX"} · motori:{" "}
                  {latex.engines.map((e) => e.name).join(", ")} · latexmk:{" "}
                  {latex.latexmkPath ? "sì" : "no"}
                </span>
              ) : (
                <span className="warn-text">
                  Nessuna distribuzione trovata. Installa TeX Live / MiKTeX / TinyTeX e ripremi
                  «Rileva». L&apos;editor non scarica nulla.
                </span>
              )
            ) : (
              <span>premi «Rileva»…</span>
            )}{" "}
            <button className="btn btn-small" onClick={() => void detectLatex()}>
              Rileva
            </button>
          </div>
        </div>

        <div className="dialog-actions">
          <button className="btn btn-primary" onClick={save}>
            Salva
          </button>
          <button className="btn" onClick={close}>
            Annulla
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsDialog;

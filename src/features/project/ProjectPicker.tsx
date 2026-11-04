// Welcome screen shown when no project is open: open folder, new project
// from template, recent projects and LaTeX installation guidance.

import { useAppStore } from "../../state/store";
import * as ipc from "../../tauri/ipc";
import { basename } from "../../utils/misc";

function LatexStatusBox(): JSX.Element {
  const latex = useAppStore((s) => s.latex);
  const latexDetecting = useAppStore((s) => s.latexDetecting);

  if (latexDetecting && !latex) {
    return <div className="latex-box">Rilevamento della distribuzione LaTeX…</div>;
  }
  if (!latex) return <div className="latex-box">Stato LaTeX sconosciuto.</div>;

  if (latex.found) {
    return (
      <div className="latex-box ok">
        <strong>LaTeX rilevato{latex.distribution ? ` (${latex.distribution})` : ""}.</strong>
        <ul className="plain-list">
          {latex.engines.map((e) => (
            <li key={e.name}>
              <code>{e.name}</code> — {e.version || e.path}
            </li>
          ))}
          <li>
            latexmk: <code>{latex.latexmkPath ? "disponibile" : "non trovato"}</code>
            {latex.latexmkPath ? "" : " (verrà usata la pipeline a passate)"}
          </li>
        </ul>
      </div>
    );
  }

  return (
    <div className="latex-box missing">
      <strong>Nessuna distribuzione LaTeX trovata.</strong>
      <p className="dialog-hint" style={{ margin: "6px 0" }}>
        L&apos;editor non scarica nulla automaticamente: installa una distribuzione e premi
        «Rileva» nelle Impostazioni.
      </p>
      <ul className="plain-list">
        <li>
          TeX Live (Windows, Linux, macOS) — <code>https://www.tug.org/texlive/</code>
        </li>
        <li>
          MiKTeX (Windows) — <code>https://miktex.org</code>
        </li>
        <li>
          TinyTeX (leggera, macOS/Linux) — <code>https://yihui.org/tinytex/</code>
        </li>
      </ul>
    </div>
  );
}

function ProjectPicker(): JSX.Element {
  const recentProjects = useAppStore((s) => s.globalSettings.recentProjects);
  const openProject = useAppStore((s) => s.openProject);
  const setUi = useAppStore((s) => s.setUi);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);

  const onOpenFolder = async (): Promise<void> => {
    const dir = await ipc.pickFolder("Apri cartella del progetto");
    if (!dir) return;
    try {
      await openProject(dir);
    } catch (e) {
      setStatusMessage(String(e));
    }
  };

  return (
    <div className="welcome">
      <div className="welcome-card">
        <h1>LaTeX Editor Offline</h1>
        <p className="subtitle">
          Editor LaTeX locale: file sul disco, compilazione con latexmk o pipeline
          a passate, anteprima PDF integrata. Nessun account, nessuna connessione.
        </p>
        <div className="welcome-actions">
          <button className="btn btn-primary" onClick={() => void onOpenFolder()}>
            Apri cartella progetto
          </button>
          <button className="btn" onClick={() => setUi({ newProjectOpen: true })}>
            Nuovo da modello
          </button>
        </div>

        {recentProjects.length > 0 && (
          <>
            <div className="recent-title">Progetti recenti</div>
            {recentProjects.map((p) => (
              <div key={p} className="recent-item" onClick={() => void openProject(p)} title={p}>
                <span>{basename(p) || p}</span>
                <span className="recent-path">{p}</span>
              </div>
            ))}
          </>
        )}

        <LatexStatusBox />
      </div>
    </div>
  );
}

export default ProjectPicker;

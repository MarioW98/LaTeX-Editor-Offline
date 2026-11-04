/** Schermata iniziale: nuovo progetto, apertura, recenti, stato LaTeX. */
import { open } from '@tauri-apps/plugin-dialog';
import { useProjectStore } from '../../state/useProjectStore';
import { useSettingsStore } from '../../state/useSettingsStore';
import { useUiStore } from '../../state/useUiStore';
import { NewDocIcon, OpenIcon, RefreshIcon, FolderIcon } from '../../filetree/icons';
import { basename } from '../../utils/paths';

export function WelcomeScreen(): JSX.Element {
  const openProject = useProjectStore((s) => s.openProject);
  const recents = useSettingsStore((s) => s.global.recentProjects);
  const latex = useSettingsStore((s) => s.latex);
  const latexChecking = useSettingsStore((s) => s.latexChecking);
  const recheckLatex = useSettingsStore((s) => s.recheckLatex);
  const setNewProjectOpen = useUiStore((s) => s.setNewProjectOpen);

  const latexOk =
    latex != null && (latex.engines['latexmk'] != null || latex.engines['pdflatex'] != null);

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="welcome-mark" aria-hidden="true">
          LX
        </div>
        <h1 className="welcome-title">LaTeX Editor Offline</h1>
        <p className="welcome-sub">
          Editor LaTeX locale: progetti composti da normali cartelle di file, compilazione con la
          distribuzione TeX installata, anteprima PDF integrata. Nessun account, nessuna connessione.
        </p>
        <div className="welcome-actions">
          <button className="btn btn-build" onClick={() => setNewProjectOpen(true)}>
            <NewDocIcon size={15} />
            <span>Nuovo progetto</span>
          </button>
          <button
            className="btn"
            onClick={() => {
              void (async () => {
                const dir = await open({ directory: true, multiple: false, title: 'Apri cartella progetto' });
                if (typeof dir === 'string') await openProject(dir);
              })();
            }}
          >
            <OpenIcon size={15} />
            <span>Apri cartella</span>
          </button>
        </div>

        {recents.length > 0 && (
          <div className="welcome-recents">
            <h2 className="welcome-h2">Progetti recenti</h2>
            <ul>
              {recents.map((r) => (
                <li key={r}>
                  <button className="welcome-recent" onClick={() => void openProject(r)} title={r}>
                    <FolderIcon size={15} />
                    <span>{basename(r) || r}</span>
                    <span className="welcome-recent-path">{r}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className={`welcome-latex${latexOk ? '' : ' warn'}`}>
        <h2 className="welcome-h2">
          Compilazione
          <button className="btn-icon" title="Rileva di nuovo" onClick={() => void recheckLatex()}>
            <RefreshIcon size={14} />
          </button>
        </h2>
        {latexChecking && <p className="welcome-latex-line">Rilevamento strumenti LaTeX…</p>}
        {latex != null && latexOk && (
          <ul className="welcome-tools">
            {Object.entries(latex.engines)
              .filter(([, v]) => v != null)
              .map(([name, tool]) => (
                <li key={name}>
                  <code>{name}</code>
                  <span className="welcome-tool-version">{tool?.version ?? tool?.path}</span>
                </li>
              ))}
          </ul>
        )}
        {latex != null && !latexOk && (
          <div>
            <p className="welcome-latex-line">
              Nessuna distribuzione LaTeX rilevata. L'editor funziona, ma per compilare serve TeX.
              Dopo l'installazione premi il pulsante di aggiornamento.
            </p>
            <ul className="welcome-install">
              <li>
                TeX Live (Windows, macOS, Linux): <code>tug.org/texlive</code>
              </li>
              <li>
                MiKTeX (Windows): <code>miktex.org</code>
              </li>
              <li>
                TinyTeX (leggero, multipiattaforma): <code>yihui.org/tinytex</code>
              </li>
            </ul>
            <p className="welcome-latex-note">
              Questa versione non scarica distribuzioni automaticamente: installa TeX a parte e
              ripremi "rileva". In alternativa imposta una cartella bin nelle impostazioni.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

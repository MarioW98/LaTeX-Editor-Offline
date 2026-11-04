import { useAppStore } from "../state/store";

function Toolbar(): JSX.Element {
  const projectName = useAppStore((s) => s.projectName);
  const hasProject = useAppStore((s) => s.projectRoot !== null);
  const buildStatus = useAppStore((s) => s.build.status);
  const engine = useAppStore((s) => s.projectSettings.engine);
  const theme = useAppStore((s) => s.globalSettings.theme);
  const ui = useAppStore((s) => s.ui);
  const setUi = useAppStore((s) => s.setUi);
  const startBuild = useAppStore((s) => s.startBuild);
  const cancelBuild = useAppStore((s) => s.cancelBuild);
  const updateProjectSettings = useAppStore((s) => s.updateProjectSettings);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const latex = useAppStore((s) => s.latex);

  const running = buildStatus === "running";
  const engineDisabled = !hasProject || running;

  return (
    <header className="toolbar">
      <div className="toolbar-brand">
        <span className="brand-name">LaTeX Editor Offline</span>
        {hasProject && <span className="brand-project">{projectName}</span>}
      </div>

      {running ? (
        <button className="btn btn-danger" onClick={() => void cancelBuild()}>
          ■ Interrompi
        </button>
      ) : (
        <button
          className="btn btn-primary"
          disabled={!hasProject}
          onClick={() => void startBuild()}
          title="Compila il progetto (produce/aggiorna il PDF)"
        >
          ▶ Compila
        </button>
      )}

      <select
        value={engine}
        disabled={engineDisabled}
        title="Motore di compilazione"
        onChange={(e) => void updateProjectSettings({ engine: e.target.value })}
      >
        <option value="pdflatex">pdflatex</option>
        <option value="xelatex">xelatex</option>
        <option value="lualatex">lualatex</option>
      </select>

      {latex && !latex.found && hasProject ? (
        <span className="danger-text" title="Nessuna distribuzione LaTeX rilevata">
          LaTeX non trovato
        </span>
      ) : null}

      <div className="toolbar-spacer" />

      {hasProject && (
        <>
          <button
            className="btn btn-ghost btn-small"
            title="Mostra/nascondi l'albero dei file"
            onClick={() => setUi({ leftPanel: !ui.leftPanel })}
          >
            File
          </button>
          <button
            className="btn btn-ghost btn-small"
            title="Mostra/nascondi l'anteprima PDF"
            onClick={() => setUi({ rightPanel: !ui.rightPanel })}
          >
            PDF
          </button>
          <button
            className="btn btn-ghost btn-small"
            title="Mostra/nascondi il pannello di output"
            onClick={() => setUi({ bottomPanel: !ui.bottomPanel })}
          >
            Output
          </button>
        </>
      )}

      <button className="btn btn-small" onClick={() => setUi({ newProjectOpen: true })}>
        Nuovo progetto
      </button>
      <button className="btn btn-small" onClick={() => setUi({ settingsOpen: true })}>
        Impostazioni
      </button>
      <button
        className="btn btn-ghost btn-small"
        title="Tema chiaro/scuro"
        onClick={() => void toggleTheme()}
      >
        {theme === "dark" ? "☾" : "☀"}
      </button>
    </header>
  );
}

export default Toolbar;

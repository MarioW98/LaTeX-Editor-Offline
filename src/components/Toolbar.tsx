/** Toolbar superiore: progetto, salvataggio, build, toggle pannelli, impostazioni. */
import { useProjectStore } from '../state/useProjectStore';
import { useEditorStore } from '../state/useEditorStore';
import { useBuildStore } from '../state/useBuildStore';
import { useUiStore } from '../state/useUiStore';
import { open } from '@tauri-apps/plugin-dialog';
import type { EngineId } from '../utils/ipc';
import { NewDocIcon, OpenIcon, SaveIcon, PlayIcon, StopIcon, SettingsIcon, TerminalIcon, DocIcon } from '../filetree/icons';

const ENGINES: EngineId[] = ['pdflatex', 'xelatex', 'lualatex'];

export function Toolbar(): JSX.Element {
  const root = useProjectStore((s) => s.root);
  const meta = useProjectStore((s) => s.meta);
  const updateMeta = useProjectStore((s) => s.updateMeta);
  const saveActive = useEditorStore((s) => s.saveActive);
  const start = useBuildStore((s) => s.start);
  const cancel = useBuildStore((s) => s.cancel);
  const running = useBuildStore((s) => s.running);
  const showOutput = useUiStore((s) => s.showOutput);
  const showPdf = useUiStore((s) => s.showPdf);
  const toggleOutput = useUiStore((s) => s.toggleOutput);
  const togglePdf = useUiStore((s) => s.togglePdf);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const setNewProjectOpen = useUiStore((s) => s.setNewProjectOpen);

  const hasProject = root != null && meta != null;

  return (
    <header className="toolbar" role="toolbar" aria-label="Barra strumenti">
      <div className="toolbar-brand">
        <span className="brand-mark" aria-hidden="true">
          LX
        </span>
        <span className="brand-name">LaTeX Editor Offline</span>
      </div>

      <div className="toolbar-group">
        <button className="btn" onClick={() => setNewProjectOpen(true)} title="Crea un nuovo progetto da template">
          <NewDocIcon size={15} />
          <span>Nuovo</span>
        </button>
        <OpenProjectButton />
      </div>

      <div className="toolbar-group">
        <button className="btn" onClick={() => void saveActive()} disabled={!hasProject} title="Salva (Ctrl/Cmd+S)">
          <SaveIcon size={15} />
          <span>Salva</span>
        </button>
      </div>

      <div className="toolbar-group">
        {hasProject && (
          <label className="engine-select" title="Motore LaTeX per questo progetto">
            <select
              value={meta.engine}
              onChange={(e) => void updateMeta({ engine: e.target.value as EngineId })}
              disabled={running}
            >
              {ENGINES.map((engine) => (
                <option key={engine} value={engine}>
                  {engine}
                </option>
              ))}
            </select>
          </label>
        )}
        {running ? (
          <button className="btn btn-stop" onClick={() => void cancel()} title="Annulla build (Ctrl/Cmd+B)">
            <StopIcon size={15} />
            <span>Interrompi</span>
          </button>
        ) : (
          <button
            className="btn btn-build"
            onClick={() => void start()}
            disabled={!hasProject}
            title="Compila il documento (Ctrl/Cmd+B)"
          >
            <PlayIcon size={15} />
            <span>Compila</span>
          </button>
        )}
      </div>

      <div className="toolbar-spacer" />

      <div className="toolbar-group">
        <button
          className={`btn-icon tb-toggle${showOutput ? ' on' : ''}`}
          onClick={toggleOutput}
          title={showOutput ? 'Nascondi pannello output' : 'Mostra pannello output'}
          aria-pressed={showOutput}
        >
          <TerminalIcon size={16} />
        </button>
        <button
          className={`btn-icon tb-toggle${showPdf ? ' on' : ''}`}
          onClick={togglePdf}
          title={showPdf ? 'Nascondi anteprima PDF' : 'Mostra anteprima PDF'}
          aria-pressed={showPdf}
        >
          <DocIcon size={16} />
        </button>
        <button className="btn-icon tb-toggle" onClick={() => setSettingsOpen(true)} title="Impostazioni">
          <SettingsIcon size={16} />
        </button>
      </div>
    </header>
  );
}

function OpenProjectButton(): JSX.Element {
  const openProject = useProjectStore((s) => s.openProject);
  return (
    <button
      className="btn"
      title="Apri una cartella progetto esistente"
      onClick={() => {
        void (async () => {
          const dir = await open({ directory: true, multiple: false, title: 'Apri cartella progetto' });
          if (typeof dir === 'string') {
            await openProject(dir);
          }
        })();
      }}
    >
      <OpenIcon size={15} />
      <span>Apri</span>
    </button>
  );
}

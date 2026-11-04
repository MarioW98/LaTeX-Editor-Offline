/** Status bar: stato build, motore, LaTeX rilevato, file, riga/colonna, salvataggio. */
import { useBuildStore } from '../state/useBuildStore';
import { useEditorStore } from '../state/useEditorStore';
import { useProjectStore } from '../state/useProjectStore';
import { useSettingsStore } from '../state/useSettingsStore';
import { SunIcon, MoonIcon } from '../filetree/icons';

export function StatusBar(): JSX.Element {
  const running = useBuildStore((s) => s.running);
  const phase = useBuildStore((s) => s.phase);
  const success = useBuildStore((s) => s.success);
  const errCount = useBuildStore((s) => s.issues.filter((i) => i.severity === 'error').length);
  const warnCount = useBuildStore((s) => s.issues.filter((i) => i.severity === 'warning').length);

  const meta = useProjectStore((s) => s.meta);
  const latex = useSettingsStore((s) => s.latex);
  const theme = useSettingsStore((s) => s.global.theme);
  const saveGlobal = useSettingsStore((s) => s.saveGlobal);

  const activeTab = useEditorStore((s) => s.tabs.find((t) => t.path === s.activePath));
  const cursorLine = useEditorStore((s) => s.cursorLine);
  const cursorCol = useEditorStore((s) => s.cursorCol);

  const buildClass = running
    ? 'sb-build running'
    : success === true
      ? 'sb-build ok'
      : success === false
        ? 'sb-build fail'
        : 'sb-build';

  const latexOk =
    latex != null && (latex.engines['latexmk'] != null || latex.engines['pdflatex'] != null);

  return (
    <footer className="statusbar" role="status">
      <span className={buildClass}>
        {running ? `Build: ${phase ?? 'in corso'}…` : phase ? `Build: ${phase}` : 'Build: inattiva'}
        {!running && (errCount > 0 || warnCount > 0) && (
          <span className="sb-counts">
            {' '}
            · {errCount} errori · {warnCount} avvisi
          </span>
        )}
      </span>
      {meta && (
        <span className="sb-item" title="Motore e file principale del progetto">
          {meta.engine}
          {meta.useLatexmk ? ' · latexmk' : ''} · main: {meta.mainFile}
        </span>
      )}
      <span
        className={`sb-item${latexOk ? '' : ' sb-warn'}`}
        title={latexOk ? 'Distribuzione LaTeX rilevata' : 'Nessun LaTeX rilevato: vedi le istruzioni nella schermata iniziale'}
      >
        {latex == null ? 'LaTeX: rilevamento…' : latexOk ? 'LaTeX: installato' : 'LaTeX: non trovato'}
      </span>

      <span className="sb-spacer" />

      {activeTab && (
        <>
          <span className="sb-item" title={activeTab.path}>
            {activeTab.rel}
          </span>
          <span className="sb-item">
            Riga {cursorLine}, Col {cursorCol}
          </span>
          <span className={`sb-item${activeTab.dirty ? ' sb-dirty' : ''}`}>
            {activeTab.dirty ? '● modificato' : 'salvato'}
          </span>
        </>
      )}
      <button
        className="btn-icon sb-theme"
        title={theme === 'dark' ? 'Passa al tema chiaro' : 'Passa al tema scuro'}
        onClick={() => void saveGlobal({ theme: theme === 'dark' ? 'light' : 'dark' })}
      >
        {theme === 'dark' ? <SunIcon size={14} /> : <MoonIcon size={14} />}
      </button>
    </footer>
  );
}

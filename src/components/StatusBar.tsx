import { useAppStore } from "../state/store";
import { formatDuration, timeHHMM } from "../utils/misc";

function StatusBar(): JSX.Element {
  const projectName = useAppStore((s) => s.projectName);
  const hasProject = useAppStore((s) => s.projectRoot !== null);
  const engine = useAppStore((s) => s.projectSettings.engine);
  const useLatexmk = useAppStore((s) => s.projectSettings.useLatexmk);
  const latex = useAppStore((s) => s.latex);
  const latexDetecting = useAppStore((s) => s.latexDetecting);
  const cursor = useAppStore((s) => s.cursor);
  const tabs = useAppStore((s) => s.tabs);
  const build = useAppStore((s) => s.build);
  const autosave = useAppStore((s) => s.globalSettings.autosaveEnabled);
  const lastSavedAt = useAppStore((s) => s.lastSavedAt);
  const statusMessage = useAppStore((s) => s.statusMessage);

  const errors = build.issues.filter((i) => i.kind === "error").length;
  const warnings = build.issues.filter((i) => i.kind === "warning").length;

  return (
    <footer className="statusbar">
      <span className="sb-item" title="Progetto corrente">
        {hasProject ? projectName : "nessun progetto"}
      </span>
      {hasProject && (
        <>
          <span className="sb-item">{engine}</span>
          <span className="sb-item" title="Usa latexmk quando disponibile">
            latexmk: {useLatexmk ? "on" : "off"}
          </span>
        </>
      )}
      {latexDetecting ? (
        <span className="sb-item">rilevamento LaTeX…</span>
      ) : latex ? (
        <span className="sb-item" title={latex.engines.map((e) => e.version).join(" | ")}>
          {latex.found ? latex.distribution ?? "LaTeX" : "LaTeX non trovato"}
        </span>
      ) : null}

      {hasProject && (
        <span className="sb-item">
          Riga {cursor.line}, Col {cursor.col} · {tabs.length} file aperti
        </span>
      )}

      <div className="sb-right">
        {statusMessage && <span className="sb-item sb-msg">{statusMessage}</span>}
        {hasProject && (
          <span className="sb-item">
            {build.status === "running"
              ? "compilazione in corso…"
              : build.status === "idle"
                ? "pronto"
                : build.status === "success"
                  ? `compilazione OK${build.durationMs ? ` (${formatDuration(build.durationMs)})` : ""}${errors > 0 ? ` · ${errors} errori` : ""}${warnings > 0 ? ` · ${warnings} avvisi` : ""}`
                  : build.status === "cancelled"
                    ? "compilazione annullata"
                    : `errore${errors > 0 ? ` · ${errors} errori` : ""}`}
          </span>
        )}
        <span className="sb-item" title="Salvataggio automatico">
          autosave {autosave ? "on" : "off"}
        </span>
        {lastSavedAt && (
          <span className="sb-item" title="Ultimo salvataggio">
            salvato {timeHHMM(lastSavedAt)}
          </span>
        )}
        <span className="sb-item">UTF-8</span>
      </div>
    </footer>
  );
}

export default StatusBar;

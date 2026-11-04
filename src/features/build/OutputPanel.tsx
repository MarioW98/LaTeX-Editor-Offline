// Bottom panel: build output — problems list and raw log, with status.

import { useEffect, useRef } from "react";

import { useAppStore } from "../../state/store";
import { formatDuration } from "../../utils/misc";
import ProblemsList from "./ProblemsList";

function statusChip(status: string): JSX.Element | null {
  switch (status) {
    case "running":
      return <span className="chip chip-running">in corso</span>;
    case "success":
      return <span className="chip chip-ok">successo</span>;
    case "error":
      return <span className="chip chip-err">errore</span>;
    case "cancelled":
      return <span className="chip chip-warn">annullata</span>;
    default:
      return null;
  }
}

function OutputPanel(): JSX.Element {
  const bottomTab = useAppStore((s) => s.ui.bottomTab);
  const setUi = useAppStore((s) => s.setUi);
  const build = useAppStore((s) => s.build);
  const cancelBuild = useAppStore((s) => s.cancelBuild);
  const clearBuildOutput = useAppStore((s) => s.clearBuildOutput);
  const logRef = useRef<HTMLPreElement | null>(null);

  const errorCount = build.issues.filter((i) => i.kind === "error").length;
  const warningCount = build.issues.length - errorCount;

  // keep the log scrolled to the bottom while it grows
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [build.output, bottomTab]);

  return (
    <div className="output-panel">
      <div className="output-header">
        <div className="output-tabs">
          <button
            className={`output-tab${bottomTab === "problems" ? " active" : ""}`}
            onClick={() => setUi({ bottomTab: "problems" })}
          >
            Problemi{build.issues.length > 0 ? ` (${build.issues.length})` : ""}
          </button>
          <button
            className={`output-tab${bottomTab === "log" ? " active" : ""}`}
            onClick={() => setUi({ bottomTab: "log" })}
          >
            Registro
          </button>
        </div>
        <div className="output-status">
          {statusChip(build.status)}
          {build.durationMs != null && <span>{formatDuration(build.durationMs)}</span>}
          {errorCount > 0 && <span className="danger-text">{errorCount} errori</span>}
          {warningCount > 0 && <span className="warn-text">{warningCount} avvisi</span>}
        </div>
        <div className="toolbar-spacer" />
        {build.status === "running" ? (
          <button className="btn btn-danger btn-small" onClick={() => void cancelBuild()}>
            Interrompi
          </button>
        ) : (
          <button className="btn btn-small" onClick={clearBuildOutput} title="Svuota registro e problemi">
            Svuota
          </button>
        )}
      </div>
      <div className="output-body">
        {bottomTab === "log" ? (
          <pre ref={logRef} className="output-log">
            {build.output.length > 0 ? build.output.join("\n") : "Registro vuoto: avvia una compilazione."}
          </pre>
        ) : (
          <ProblemsList />
        )}
      </div>
    </div>
  );
}

export default OutputPanel;

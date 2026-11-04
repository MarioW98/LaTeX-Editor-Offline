import { useStore } from "../state/store";
import styles from "../styles/layout.module.css";

export function StatusBar() {
  const rootPath = useStore((s) => s.rootPath);
  const latex = useStore((s) => s.latex);
  const lastBuildSuccess = useStore((s) => s.lastBuildSuccess);
  const lastBuildDurationMs = useStore((s) => s.lastBuildDurationMs);
  const mainFile = useStore((s) => s.settings.mainFile);
  const engine = useStore((s) => s.settings.engine);

  const hasAnyEngine = (latex?.tools ?? []).some((t) => t.available);
  const latexmk = latex?.latexmkAvailable ?? false;

  let latexLabel: string;
  let cls = styles.dotRed;
  if (latexmk) {
    latexLabel = "LaTeX pronto (latexmk)";
    cls = styles.dotGreen;
  } else if (hasAnyEngine) {
    latexLabel = "LaTeX pronto (multi-passaggio)";
    cls = styles.dotYellow;
  } else {
    latexLabel = "Distribuzione LaTeX non rilevata";
  }

  const buildLabel =
    lastBuildSuccess === null
      ? "nessuna compilazione"
      : lastBuildSuccess
        ? `compilazione riuscita${lastBuildDurationMs !== null ? ` in ${(lastBuildDurationMs / 1000).toFixed(1)}s` : ""}`
        : "compilazione fallita";

  return (
    <footer className={styles.statusBar}>
      <span className={`${styles.dot} ${cls}`} title={latexLabel} />
      <span>{latexLabel}</span>
      <span className={styles.statusSep}>|</span>
      <span>{buildLabel}</span>
      <span className={styles.statusSep}>|</span>
      <span>
        {mainFile} ({engine})
      </span>
      <span className={styles.statusSpacer} />
      <span className={styles.rootPath} title={rootPath ?? ""}>
        {rootPath}
      </span>
    </footer>
  );
}

import { useStore } from "../state/store";
import { LatexChip } from "./LatexChip";
import styles from "../styles/layout.module.css";

export function StatusBar() {
  const rootPath = useStore((s) => s.rootPath);
  const lastBuildSuccess = useStore((s) => s.lastBuildSuccess);
  const lastBuildDurationMs = useStore((s) => s.lastBuildDurationMs);
  const mainFile = useStore((s) => s.settings.mainFile);
  const engine = useStore((s) => s.settings.engine);

  const buildLabel =
    lastBuildSuccess === null
      ? "nessuna compilazione"
      : lastBuildSuccess
        ? `compilazione riuscita${lastBuildDurationMs !== null ? ` in ${(lastBuildDurationMs / 1000).toFixed(1)}s` : ""}`
        : "compilazione fallita";

  return (
    <footer className={styles.statusBar}>
      <LatexChip />
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

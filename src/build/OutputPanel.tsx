import { useEffect, useRef } from "react";
import { useStore } from "../state/store";
import styles from "../styles/panels.module.css";

export function OutputPanel() {
  const buildLog = useStore((s) => s.buildLog);
  const buildRunning = useStore((s) => s.buildRunning);
  const lastBuildSuccess = useStore((s) => s.lastBuildSuccess);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [buildLog.length]);

  const errorCount = buildLog.filter((l) => l.kind === "error").length;
  const warnCount = buildLog.filter((l) => l.kind === "warning").length;

  return (
    <section className={styles.outputPanel}>
      <div className={styles.outputHeader}>
        <strong>Output compilazione</strong>
        <span className={styles.outputStats}>
          {buildRunning
            ? "compilazione in corso..."
            : lastBuildSuccess === true
              ? "terminata con successo"
              : lastBuildSuccess === false
                ? "terminata con errori"
                : "in attesa"}
          {` · ${errorCount} errori · ${warnCount} avvisi`}
        </span>
        <span className={styles.outputActions}>
          {buildRunning && (
            <button onClick={() => useStore.getState().cancelBuild()}>Ferma</button>
          )}
          <button onClick={() => useStore.getState().clearLog()}>Pulisci</button>
        </span>
      </div>
      <div className={styles.outputScroll} ref={scrollRef}>
        {buildLog.length === 0 && (
          <p className={styles.outputPlaceholder}>
            Premi Compila (F5) per compilare il progetto. Gli errori con file e
            riga sono cliccabili per aprire il punto esatto nel sorgente.
          </p>
        )}
        {buildLog.map((l, i) => (
          <div
            key={i}
            className={`${styles.logLine} ${
              l.kind === "error"
                ? styles.logError
                : l.kind === "warning"
                  ? styles.logWarning
                  : l.kind === "stderr"
                    ? styles.logStderr
                    : ""
            }`}
            onClick={() => {
              if (l.file && l.line) useStore.getState().jumpTo(l.file, l.line);
            }}
            title={l.file && l.line ? "Clic per aprire il punto nel sorgente" : undefined}
          >
            <span className={styles.logText}>{l.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

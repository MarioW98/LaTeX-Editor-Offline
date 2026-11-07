import { useStore, type UpdateUiState } from "../state/store";
import styles from "../styles/layout.module.css";

export function TopBar() {
  const rootPath = useStore((s) => s.rootPath);
  const projectName = rootPath?.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
  const buildRunning = useStore((s) => s.buildRunning);
  const engine = useStore((s) => s.settings.engine);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const outputOpen = useStore((s) => s.outputOpen);
  const pdfOpen = useStore((s) => s.pdfOpen);
  const dirtyCount = useStore(
    (s) => Object.values(s.dirty).filter(Boolean).length,
  );
  const update = useStore((s) => s.update);

  // MU.3 — l'unico ingresso del flusso aggiornamenti è questo click.
  // Nessun effetto, nessun timer, nessun bootstrap: mai automatico.
  const updateBusy = update.phase === "checking" || update.phase === "downloading";
  const updateLabel =
    update.phase === "checking"
      ? "Controllo…"
      : update.phase === "downloading"
        ? "Scaricamento…"
        : "Controlla aggiornamenti";

  return (
    <>
      <header className={styles.topBar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>T</span>
          <span className={styles.brandName}>LaTeX Editor Offline</span>
          <span className={styles.projectName}>{projectName}</span>
          {dirtyCount > 0 && (
            <span className={styles.dirtyBadge}>{dirtyCount} non salvati</span>
          )}
        </div>
        <div className={styles.topActions}>
          <button className={styles.btn} onClick={() => useStore.getState().openProjectFolder()}>
            Apri cartella
          </button>
          <select
            className={styles.select}
            value={engine}
            onChange={(e) =>
              useStore.getState().updateSettings({ engine: e.target.value as never })
            }
            title="Motore LaTeX"
          >
            <option value="pdflatex">pdflatex</option>
            <option value="xelatex">xelatex</option>
            <option value="lualatex">lualatex</option>
          </select>
          {buildRunning ? (
            <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => useStore.getState().cancelBuild()}>
              Ferma compilazione
            </button>
          ) : (
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => useStore.getState().build()}>
              Compila (F5)
            </button>
          )}
          <span className={styles.separator} />
          <button
            className={`${styles.btn} ${sidebarOpen ? styles.btnActive : ""}`}
            onClick={() => useStore.getState().toggleSidebar()}
            title="Mostra/nascondi file"
          >
            File
          </button>
          <button
            className={`${styles.btn} ${outputOpen ? styles.btnActive : ""}`}
            onClick={() => useStore.getState().toggleOutput()}
            title="Mostra/nascondi output"
          >
            Output
          </button>
          <button
            className={`${styles.btn} ${pdfOpen ? styles.btnActive : ""}`}
            onClick={() => useStore.getState().togglePdf()}
            title="Mostra/nascondi anteprima PDF"
          >
            PDF
          </button>
          <button
            className={styles.btn}
            onClick={() => useStore.getState().setSettingsOpen(true)}
            title="Impostazioni progetto"
          >
            Impostazioni
          </button>
          <button
            className={styles.btn}
            onClick={() => useStore.getState().checkForUpdates()}
            disabled={updateBusy}
            title="Cerca aggiornamenti SOLO adesso, su richiesta: l'app non li controlla mai da sola, niente telemetria"
          >
            {updateLabel}
          </button>
        </div>
      </header>
      {update.phase !== "idle" && <UpdateStrip update={update} />}
    </>
  );
}

/**
 * Stato visibile dell'aggiornamento (MU.3): ogni fase della macchina a stati
 * ha un messaggio esplicito — gli errori di rete non sono mai silenziosi.
 */
function UpdateStrip({ update }: { update: UpdateUiState }) {
  const run = useStore.getState();

  if (update.phase === "checking") {
    return (
      <div className={styles.updateBar} data-testid="update-bar">
        <span className={styles.updateMessage}>Controllo aggiornamenti in corso…</span>
        <button className={styles.btn} onClick={() => run.resetUpdateUi()}>
          Chiudi
        </button>
      </div>
    );
  }

  if (update.phase === "up-to-date") {
    return (
      <div className={styles.updateBar} data-testid="update-bar">
        <span className={styles.updateMessage}>
          Nessun aggiornamento disponibile: la versione installata è aggiornata.
        </span>
        <button className={styles.btn} onClick={() => run.resetUpdateUi()}>
          Chiudi
        </button>
      </div>
    );
  }

  if (update.phase === "available") {
    return (
      <div className={styles.updateBar} data-testid="update-bar">
        <span className={styles.updateMessage}>
          Disponibile la versione <strong>{update.version}</strong>.
          {update.notes ? ` ${update.notes.split("\n")[0].slice(0, 140)}` : ""}
        </span>
        <button
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={() => run.downloadUpdate()}
        >
          Scarica aggiornamento
        </button>
        <button className={styles.btn} onClick={() => run.resetUpdateUi()}>
          Non ora
        </button>
      </div>
    );
  }

  if (update.phase === "downloading") {
    const pct =
      update.total && update.total > 0
        ? Math.min(100, Math.round((update.received / update.total) * 100))
        : null;
    return (
      <div className={styles.updateBar} data-testid="update-bar">
        <span className={styles.updateMessage}>
          Scaricamento della versione {update.version}
          {pct !== null ? ` — ${pct}%` : " in corso…"}
        </span>
        <div className={styles.updateProgressTrack} role="progressbar">
          <div className={styles.updateProgressFill} style={{ width: `${pct ?? 100}%` }} />
        </div>
      </div>
    );
  }

  if (update.phase === "ready") {
    return (
      <div className={styles.updateBar} data-testid="update-bar">
        <span className={styles.updateMessage}>
          Aggiornamento alla versione {update.version} pronto. Prima di installare
          vengono salvati tutti i file non salvati; su Windows l'app si chiude
          per installare e riapre da sola.
        </span>
        <button
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={() => run.installUpdate()}
        >
          Installa e riavvia
        </button>
        <button className={styles.btn} onClick={() => run.resetUpdateUi()}>
          Più tardi
        </button>
      </div>
    );
  }

  if (update.phase === "error") {
    return (
      <div className={`${styles.updateBar} ${styles.updateBarError}`} data-testid="update-bar">
        <div className={styles.updateMessageCol}>
          <span className={styles.updateMessage}>{update.message}</span>
          {update.detail && (
            <span className={styles.updateMessageDetail} title={update.detail}>
              {update.detail}
            </span>
          )}
        </div>
        <button className={styles.btn} onClick={() => run.checkForUpdates()}>
          Riprova
        </button>
        <button className={styles.btn} onClick={() => run.resetUpdateUi()}>
          Chiudi
        </button>
      </div>
    );
  }

  return null;
}

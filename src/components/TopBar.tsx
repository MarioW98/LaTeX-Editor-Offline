import { useStore } from "../state/store";
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

  return (
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
      </div>
    </header>
  );
}

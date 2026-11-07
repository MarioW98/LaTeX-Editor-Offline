import { useStore } from "../state/store";
import styles from "../styles/layout.module.css";

/**
 * M0.7.1 — dialog di guida aperto da «Compila (F5)» quando start_build è
 * respinto dal gate del toolchain: l'esito tipizzato arriva qui come
 * messaggio azionabile (come installare una distribuzione LaTeX, o come
 * scegliere un motore presente), NON come stringa grezza nel log.
 */
export function BuildStartDialog() {
  const buildDialog = useStore((s) => s.buildDialog);

  if (!buildDialog) return null;

  return (
    <div
      className={styles.overlay}
      onClick={() => useStore.getState().closeBuildDialog()}
      data-testid="build-start-dialog"
    >
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h2>{buildDialog.title}</h2>
        <p className={styles.dialogBody}>{buildDialog.body}</p>
        <div className={styles.dialogActions}>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => useStore.getState().closeBuildDialog()}
          >
            Ho capito
          </button>
        </div>
      </div>
    </div>
  );
}

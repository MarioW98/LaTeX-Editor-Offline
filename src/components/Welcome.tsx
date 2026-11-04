import { useState } from "react";
import { useStore } from "../state/store";
import { TEMPLATES } from "../features/templates";
import styles from "../styles/layout.module.css";

export function Welcome() {
  const latex = useStore((s) => s.latex);
  const welcomeAction = useStore((s) => s.welcomeAction);
  const selectedTemplateId = useStore((s) => s.selectedTemplateId);
  const [projectName, setProjectName] = useState("nuovo-articolo");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const hasAnyEngine = (latex?.tools ?? []).some((t) => t.available);
  const latexmk = latex?.latexmkAvailable ?? false;

  const createFromTemplate = async () => {
    setBusy(true);
    setError(null);
    try {
      await useStore.getState().createProjectFromTemplate(selectedTemplateId, projectName);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.welcome}>
      <div className={styles.welcomeCard}>
        <h1 className={styles.welcomeTitle}>
          <span className={styles.brandMark}>T</span> LaTeX Editor Offline
        </h1>
        <p className={styles.welcomeSub}>
          Editor LaTeX da scrivania, completamente offline: i progetti restano
          sul tuo disco, la compilazione avviene in locale, nessun account e
          nessun accesso alla rete.
        </p>

        <div className={styles.welcomeActions}>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => useStore.getState().openProjectFolder()}
          >
            Apri una cartella progetto
          </button>
          <button
            className={styles.btn}
            onClick={() => useStore.getState().setWelcomeAction("template")}
          >
            Nuovo progetto da template
          </button>
        </div>

        {welcomeAction === "template" && (
          <div className={styles.templateBlock}>
            <h2>Scegli un template</h2>
            <div className={styles.templateGrid}>
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  className={`${styles.templateCard} ${selectedTemplateId === t.id ? styles.templateCardActive : ""}`}
                  onClick={() => useStore.getState().setSelectedTemplateId(t.id)}
                >
                  <strong>{t.name}</strong>
                  <span>{t.description}</span>
                </button>
              ))}
            </div>
            <div className={styles.templateForm}>
              <label>
                Nome del progetto:{" "}
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="es. tesi-2026"
                />
              </label>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={busy}
                onClick={createFromTemplate}
              >
                {busy ? "Creazione..." : "Crea progetto (scegli la cartella padre)"}
              </button>
            </div>
            {error && <p className={styles.errorText}>{error}</p>}
          </div>
        )}

        <div className={styles.latexCheck}>
          <h2>Distribuzione LaTeX</h2>
          {!latex && <p>Rilevamento in corso...</p>}
          {latex && !hasAnyEngine && (
            <p className={styles.warnText}>
              Nessun motore LaTeX rilevato sul sistema. Installa TeX Live
              (Linux), MiKTeX (Windows) o MacTeX (macOS), poi riavvia l'editor.
            </p>
          )}
          {latex && hasAnyEngine && (
            <ul>
              {latex.tools
                .filter((t) => t.available)
                .map((t) => (
                  <li key={t.name}>
                    <strong>{t.name}</strong> — {t.version || "disponibile"}
                  </li>
                ))}
              {!latexmk && (
                <li className={styles.warnText}>
                  latexmk non trovato: la compilazione userà la sequenza
                  multi-passaggio interna.
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

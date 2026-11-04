// New project dialog: pick a template, a destination folder and a name.

import { useState } from "react";

import { useAppStore } from "../../state/store";
import * as ipc from "../../tauri/ipc";
import { basename } from "../../utils/misc";

function NewProjectDialog(): JSX.Element {
  const templates = useAppStore((s) => s.templates);
  const setUi = useAppStore((s) => s.setUi);
  const openProject = useAppStore((s) => s.openProject);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);

  const [templateId, setTemplateId] = useState<string>(templates[0]?.id ?? "article");
  const [name, setName] = useState("");
  const [parentDir, setParentDir] = useState("");
  const [creating, setCreating] = useState(false);

  const close = (): void => setUi({ newProjectOpen: false });

  const browse = async (): Promise<void> => {
    const dir = await ipc.pickFolder("Cartella di destinazione");
    if (dir) setParentDir(dir);
  };

  const create = async (): Promise<void> => {
    const trimmed = name.trim();
    if (!templateId || trimmed.length === 0 || parentDir.length === 0) return;
    setCreating(true);
    try {
      const root = await ipc.createProjectFromTemplate(templateId, parentDir, trimmed);
      await openProject(root);
      close();
    } catch (e) {
      setStatusMessage(String(e));
    } finally {
      setCreating(false);
    }
  };

  const canCreate = templateId.length > 0 && name.trim().length > 0 && parentDir.length > 0 && !creating;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal" role="dialog" aria-modal={true} aria-label="Nuovo progetto">
        <h3>Nuovo progetto da modello</h3>

        <div className="template-grid">
          {templates.map((t) => (
            <div
              key={t.id}
              className={`template-card${t.id === templateId ? " selected" : ""}`}
              onClick={() => setTemplateId(t.id)}
            >
              <div className="t-name">{t.name}</div>
              <div className="t-desc">{t.description}</div>
            </div>
          ))}
        </div>

        <div className="form-row">
          <label htmlFor="np-name">Nome del progetto</label>
          <input
            id="np-name"
            type="text"
            value={name}
            placeholder="es. mio-articolo"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="form-row">
          <label htmlFor="np-dir">Cartella di destinazione</label>
          <input
            id="np-dir"
            type="text"
            value={parentDir}
            placeholder="premi «Sfoglia»…"
            readOnly
            title={parentDir}
          />
          <button className="btn" onClick={() => void browse()}>
            Sfoglia
          </button>
        </div>
        {parentDir && (
          <p className="dialog-hint">
            Verrà creata: <code>{`${parentDir}${parentDir.endsWith("/") || parentDir.endsWith("\\") ? "" : "/"}${name.trim() || "…"}`}</code>
          </p>
        )}

        <div className="dialog-actions">
          <button className="btn btn-primary" disabled={!canCreate} onClick={() => void create()}>
            {creating ? "Creazione…" : "Crea e apri"}
          </button>
          <button className="btn" onClick={close}>
            Annulla
          </button>
        </div>
        <p className="dialog-hint" style={{ marginTop: 10 }}>
          Suggerimento: il nome diventa il nome della cartella ({basename(parentDir) || "…"}
          /nome). I modelli sono contenuti originali, liberi da modificare.
        </p>
      </div>
    </div>
  );
}

export default NewProjectDialog;

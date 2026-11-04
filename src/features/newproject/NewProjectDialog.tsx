/** Dialog "Nuovo progetto": scelta template, nome e cartella genitore. */
import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Modal } from '../../components/Modal';
import { useProjectStore } from '../../state/useProjectStore';
import { useUiStore } from '../../state/useUiStore';

interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  files: string;
}

const TEMPLATES: TemplateInfo[] = [
  {
    id: 'article',
    name: 'Article',
    description: 'Articolo con abstract, sezioni, equazione e bibliografia.',
    files: 'main.tex · bibliography.bib · README.md · .gitignore',
  },
  {
    id: 'report',
    name: 'Report',
    description: 'Relazione con frontespizio, indice e capitoli.',
    files: 'main.tex · bibliography.bib · README.md · .gitignore',
  },
  {
    id: 'book',
    name: 'Book',
    description: 'Libro con frontmatter, capitoli e appendice.',
    files: 'main.tex · bibliography.bib · README.md · .gitignore',
  },
  {
    id: 'beamer',
    name: 'Beamer',
    description: 'Presentazione con frame e sommario (richiede la classe beamer).',
    files: 'main.tex · bibliography.bib · README.md · .gitignore',
  },
  {
    id: 'thesis',
    name: 'Thesis-like',
    description: 'Base ispirata a una tesi: frontespizio, sommario, capitoli.',
    files: 'main.tex · bibliography.bib · README.md · .gitignore',
  },
];

export function NewProjectDialog(): JSX.Element {
  const newProjectOpen = useUiStore((s) => s.newProjectOpen);
  const setNewProjectOpen = useUiStore((s) => s.setNewProjectOpen);
  const createProject = useProjectStore((s) => s.createProject);

  const [template, setTemplate] = useState('article');
  const [name, setName] = useState('articolo');
  const [parent, setParent] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  if (!newProjectOpen) return <></>;

  const canCreate = parent != null && name.trim().length > 0 && !creating;

  const pickFolder = async () => {
    const dir = await open({ directory: true, multiple: false, title: 'Cartella genitore del progetto' });
    if (typeof dir === 'string') setParent(dir);
  };

  const submit = async () => {
    if (!parent || !canCreate) return;
    setCreating(true);
    const ok = await createProject(parent, name.trim(), template);
    setCreating(false);
    if (ok) setNewProjectOpen(false);
  };

  return (
    <Modal title="Nuovo progetto" onClose={() => setNewProjectOpen(false)} wide>
      <div className="np-grid">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            className={`np-card${template === t.id ? ' on' : ''}`}
            onClick={() => {
              setTemplate(t.id);
              setName(t.id);
            }}
          >
            <span className="np-name">{t.name}</span>
            <span className="np-desc">{t.description}</span>
            <span className="np-files">{t.files}</span>
          </button>
        ))}
      </div>

      <div className="np-form">
        <label className="field">
          <span>Nome del progetto</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="es. mio-articolo"
            autoFocus
          />
        </label>
        <label className="field">
          <span>Cartella genitore (verrà creata la sottocartella con il nome)</span>
          <div className="np-folder">
            <input value={parent ?? ''} readOnly placeholder="scegli una cartella…" />
            <button className="btn" onClick={() => void pickFolder()}>
              Scegli…
            </button>
          </div>
        </label>
        <div className="np-actions">
          <button className="btn" onClick={() => setNewProjectOpen(false)}>
            Annulla
          </button>
          <button className="btn btn-build" disabled={!canCreate} onClick={() => void submit()}>
            {creating ? 'Creazione…' : 'Crea progetto'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

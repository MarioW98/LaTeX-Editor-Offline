/**
 * Albero file del progetto: navigazione, creazione file/cartelle, rinomina,
 * eliminazione, refresh, "imposta come file principale".
 * Menu contestuale proprio (nessuna libreria esterna).
 */
import { useEffect, useMemo, useState } from 'react';
import { confirm } from '@tauri-apps/plugin-dialog';
import type { FileNode } from '../utils/ipc';
import { extOf } from '../utils/paths';
import { useProjectStore } from '../state/useProjectStore';
import { useEditorStore } from '../state/useEditorStore';
import { useToastStore } from '../state/useToastStore';
import { FileIconByExt, FolderIcon, ChevronIcon, PlusIcon, RefreshIcon } from './icons';
import { isEditableFile, isTexFile, parentDirOf } from './treeUtils';

interface CreatingState {
  dirRel: string;
  kind: 'file' | 'dir';
}

interface MenuState {
  x: number;
  y: number;
  node: FileNode | null; // null = radice
}

export function FileTree(): JSX.Element | null {
  const tree = useProjectStore((s) => s.tree);
  const meta = useProjectStore((s) => s.meta);
  const refreshTree = useProjectStore((s) => s.refreshTree);
  const createEntry = useProjectStore((s) => s.createEntry);
  const renameEntry = useProjectStore((s) => s.renameEntry);
  const deleteEntry = useProjectStore((s) => s.deleteEntry);
  const setMainFile = useProjectStore((s) => s.setMainFile);

  const [expanded, setExpanded] = useState<Set<string>>(new Set(['']));
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [creating, setCreating] = useState<CreatingState | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');

  // Chiude il menu contestuale con un clic ovunque.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menu]);

  const toggle = (rel: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(rel)) next.delete(rel);
      else next.add(rel);
      return next;
    });
  };

  const beginCreate = (dirRel: string, kind: 'file' | 'dir') => {
    setCreating({ dirRel, kind });
    setNameDraft('');
    setMenu(null);
    if (dirRel) setExpanded((prev) => new Set(prev).add(dirRel));
  };

  const commitCreate = async () => {
    if (!creating) return;
    const name = nameDraft.trim();
    if (!name || name.includes('/') || name.includes('\\')) {
      useToastStore.getState().push('error', 'Nome non valido.');
      return;
    }
    const rel = creating.dirRel ? `${creating.dirRel}/${name}` : name;
    const ok = await createEntry(rel, creating.kind === 'dir');
    setCreating(null);
    if (ok && creating.kind === 'file') {
      await useEditorStore.getState().openFile(rel);
    }
  };

  const commitRename = async () => {
    const oldRel = renaming;
    if (oldRel == null) return;
    const name = nameDraft.trim();
    setRenaming(null);
    if (!name || name.includes('/') || name.includes('\\')) {
      useToastStore.getState().push('error', 'Nome non valido.');
      return;
    }
    const parent = parentDirOf(oldRel);
    const newRel = parent ? `${parent}/${name}` : name;
    if (newRel === oldRel) return;
    const ok = await renameEntry(oldRel, newRel);
    if (ok) useEditorStore.getState().onRenamed(oldRel, newRel);
  };

  const doDelete = async (rel: string) => {
    setMenu(null);
    let ok = false;
    try {
      ok = await confirm(`Eliminare definitivamente "${rel}"?`, {
        title: 'Elimina',
        kind: 'warning',
      });
    } catch {
      ok = false;
    }
    if (!ok) return;
    const deleted = await deleteEntry(rel);
    if (deleted) useEditorStore.getState().onDeleted(rel);
  };

  const nodes = useMemo(() => tree?.children ?? [], [tree]);

  if (!tree) return null;

  return (
    <aside className="filetree" aria-label="Albero file">
      <header className="filetree-header">
        <span className="filetree-title" title={meta?.name ?? ''}>
          {meta?.name ?? 'Progetto'}
        </span>
        <span className="filetree-actions">
          <button className="btn-icon" title="Nuovo file nella radice" onClick={() => beginCreate('', 'file')}>
            <PlusIcon size={14} />
          </button>
          <button className="btn-icon" title="Nuova cartella nella radice" onClick={() => beginCreate('', 'dir')}>
            <FolderIcon size={14} />
          </button>
          <button className="btn-icon" title="Aggiorna albero" onClick={() => void refreshTree()}>
            <RefreshIcon size={14} />
          </button>
        </span>
      </header>

      <div className="filetree-body">
        {nodes.length === 0 && <div className="filetree-empty">Cartella vuota.</div>}
        {nodes.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            depth={0}
            expanded={expanded}
            onToggle={toggle}
            mainFile={meta?.mainFile ?? null}
            onOpen={(rel) => {
              if (isEditableFile(rel)) void useEditorStore.getState().openFile(rel);
              else useToastStore.getState().push('info', 'Questo tipo di file non si apre nell\'editor.');
            }}
            onMenu={(x, y, node) => setMenu({ x, y, node })}
            onSetMain={(rel) => void setMainFile(rel)}
            creating={creating}
            renaming={renaming}
            nameDraft={nameDraft}
            setNameDraft={setNameDraft}
            onCommitCreate={() => void commitCreate()}
            onCancelCreate={() => setCreating(null)}
            onBeginRename={(rel) => {
              setRenaming(rel);
              setNameDraft(rel.slice(rel.lastIndexOf('/') + 1));
              setMenu(null);
            }}
            onCommitRename={() => void commitRename()}
            onCancelRename={() => setRenaming(null)}
            onDelete={(rel) => void doDelete(rel)}
          />
        ))}
        {creating && creating.dirRel === '' && (
          <NewEntryInput
            kind={creating.kind}
            nameDraft={nameDraft}
            setNameDraft={setNameDraft}
            onCommit={() => void commitCreate()}
            onCancel={() => setCreating(null)}
            depth={0}
          />
        )}
      </div>

      {menu && (
        <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} role="menu">
          {(menu.node?.kind ?? 'dir') === 'dir' && (
            <>
              <button
                className="ctx-item"
                role="menuitem"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => beginCreate(menu.node?.path ?? '', 'file')}
              >
                Nuovo file
              </button>
              <button
                className="ctx-item"
                role="menuitem"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => beginCreate(menu.node?.path ?? '', 'dir')}
              >
                Nuova cartella
              </button>
              <div className="ctx-sep" />
            </>
          )}
          {menu.node && (
            <>
              {isTexFile(menu.node.path) && (
                <button
                  className="ctx-item"
                  role="menuitem"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    void setMainFile(menu.node!.path);
                    setMenu(null);
                  }}
                >
                  Imposta come file principale
                </button>
              )}
              <button
                className="ctx-item"
                role="menuitem"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => {
                  const rel = menu.node!.path;
                  setMenu(null);
                  setRenaming(rel);
                  setNameDraft(rel.slice(rel.lastIndexOf('/') + 1));
                }}
              >
                Rinomina
              </button>
              <button
                className="ctx-item ctx-danger"
                role="menuitem"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => void doDelete(menu.node!.path)}
              >
                Elimina
              </button>
            </>
          )}
          {!menu.node && (
            <button
              className="ctx-item"
              role="menuitem"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => {
                void refreshTree();
                setMenu(null);
              }}
            >
              Ricarica albero
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  expanded: Set<string>;
  /** File principale del progetto (per il contrassegno "main"). */
  mainFile: string | null;
  onToggle: (rel: string) => void;
  onOpen: (rel: string) => void;
  onMenu: (x: number, y: number, node: FileNode | null) => void;
  onSetMain: (rel: string) => void;
  creating: CreatingState | null;
  renaming: string | null;
  nameDraft: string;
  setNameDraft: (v: string) => void;
  onCommitCreate: () => void;
  onCancelCreate: () => void;
  onBeginRename: (rel: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onDelete: (rel: string) => void;
}

function TreeNode(props: TreeNodeProps): JSX.Element {
  const { node, depth, expanded } = props;
  const isOpen = expanded.has(node.path);
  const isMain = props.mainFile === node.path;

  if (node.kind === 'file') {
    if (props.renaming === node.path) {
      return (
        <NameInput
          nameDraft={props.nameDraft}
          setNameDraft={props.setNameDraft}
          onCommit={props.onCommitRename}
          onCancel={props.onCancelRename}
          depth={depth}
        />
      );
    }
    return (
      <div
        className={`ft-row ft-file${isMain ? ' ft-main' : ''}`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        title={isMain ? `${node.path} — file principale` : node.path}
        onClick={() => props.onOpen(node.path)}
        onContextMenu={(e) => {
          e.preventDefault();
          props.onMenu(e.clientX, e.clientY, node);
        }}
      >
        <FileIconByExt ext={extOf(node.path)} />
        <span className="ft-name">{node.name}</span>
        {isMain && <span className="ft-main-tag">main</span>}
      </div>
    );
  }

  return (
    <div>
      <div
        className="ft-row ft-dir"
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onContextMenu={(e) => {
          e.preventDefault();
          props.onMenu(e.clientX, e.clientY, node);
        }}
      >
        <button
          className="ft-chevron"
          aria-label={isOpen ? 'Comprimi' : 'Espandi'}
          onClick={() => props.onToggle(node.path)}
        >
          <ChevronIcon size={12} className={isOpen ? 'ft-chev-open' : ''} />
        </button>
        <FolderIcon size={15} />
        {props.renaming === node.path ? (
          <NameInput
            nameDraft={props.nameDraft}
            setNameDraft={props.setNameDraft}
            onCommit={props.onCommitRename}
            onCancel={props.onCancelRename}
            depth={0}
            inline
          />
        ) : (
          <button className="ft-name ft-dirname" onClick={() => props.onToggle(node.path)}>
            {node.name}
          </button>
        )}
      </div>
      {isOpen && (
        <div>
          {(node.children ?? []).map((child) => (
            <TreeNode key={child.path} {...props} node={child} depth={depth + 1} />
          ))}
          {props.creating && props.creating.dirRel === node.path && (
            <NewEntryInput
              kind={props.creating.kind}
              nameDraft={props.nameDraft}
              setNameDraft={props.setNameDraft}
              onCommit={props.onCommitCreate}
              onCancel={props.onCancelCreate}
              depth={depth + 1}
            />
          )}
        </div>
      )}
    </div>
  );
}

interface NameInputProps {
  nameDraft: string;
  setNameDraft: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  depth: number;
  inline?: boolean;
}

function NameInput({ nameDraft, setNameDraft, onCommit, onCancel, depth, inline }: NameInputProps): JSX.Element {
  if (inline) {
    return (
      <input
        className="ft-input"
        autoFocus
        value={nameDraft}
        onChange={(e) => setNameDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit();
          if (e.key === 'Escape') onCancel();
        }}
        onBlur={onCancel}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }
  return (
    <div className="ft-row" style={{ paddingLeft: `${8 + depth * 14}px` }}>
      <input
        className="ft-input"
        autoFocus
        value={nameDraft}
        onChange={(e) => setNameDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit();
          if (e.key === 'Escape') onCancel();
        }}
        onBlur={onCancel}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function NewEntryInput(props: {
  kind: 'file' | 'dir';
  nameDraft: string;
  setNameDraft: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  depth: number;
}): JSX.Element {
  return (
    <div className="ft-row ft-new" style={{ paddingLeft: `${8 + props.depth * 14}px` }}>
      {props.kind === 'dir' ? <FolderIcon size={15} /> : <FileIconByExt ext="" />}
      <input
        className="ft-input"
        autoFocus
        placeholder={props.kind === 'dir' ? 'nuova cartella…' : 'nuovo file…'}
        value={props.nameDraft}
        onChange={(e) => props.setNameDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') props.onCommit();
          if (e.key === 'Escape') props.onCancel();
        }}
        onBlur={props.onCancel}
      />
    </div>
  );
}

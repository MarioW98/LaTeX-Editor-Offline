import { useState } from "react";
import { useStore } from "../state/store";
import type { FileNode } from "../types";
import styles from "../styles/panels.module.css";

interface RowProps {
  node: FileNode;
  depth: number;
  expanded: Set<string>;
  toggle: (path: string) => void;
}

function Row({ node, depth, expanded, toggle }: RowProps) {
  const openFile = useStore((s) => s.openFile);
  const activeTab = useStore((s) => s.activeTab);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState(node.name);

  const doRename = () => {
    const name = draft.trim();
    setEditing(false);
    if (!name || name === node.name) return;
    const parent = node.path.includes("/")
      ? node.path.slice(0, node.path.lastIndexOf("/"))
      : "";
    const newPath = parent ? `${parent}/${name}` : name;
    useStore
      .getState()
      .renameItem(node.path, name)
      .then(() => {
        if (activeTab === node.path && node.kind === "file") {
          useStore.getState().openFile(newPath).catch(() => undefined);
        }
      })
      .catch((e) => alert(`rinominazione fallita: ${e}`));
  };

  const doDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 2500);
      return;
    }
    useStore
      .getState()
      .deleteItem(node.path)
      .catch((e) => alert(`eliminazione fallita: ${e}`));
  };

  return (
    <div>
      <div
        className={`${styles.treeRow} ${activeTab === node.path ? styles.treeRowActive : ""}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => (node.kind === "dir" ? toggle(node.path) : openFile(node.path).catch(() => undefined))}
      >
        <span className={styles.treeIcon}>{node.kind === "dir" ? (expanded.has(node.path) ? "▾" : "▸") : "¶"}</span>
        {editing ? (
          <input
            className={styles.treeInput}
            value={draft}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={doRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") doRename();
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <span className={styles.treeName} title={node.path}>
            {node.name}
          </span>
        )}
        <span className={styles.treeActions}>
          <button
            title="Rinomina"
            onClick={(e) => {
              e.stopPropagation();
              setDraft(node.name);
              setEditing(true);
            }}
          >
            rin
          </button>
          <button
            title="Elimina"
            className={confirmDelete ? styles.treeDeleteArmed : ""}
            onClick={(e) => {
              e.stopPropagation();
              doDelete();
            }}
          >
            {confirmDelete ? "sicuro?" : "del"}
          </button>
        </span>
      </div>
      {node.kind === "dir" && expanded.has(node.path) && (node.children ?? []).map((c) => (
        <Row key={c.path} node={c} depth={depth + 1} expanded={expanded} toggle={toggle} />
      ))}
    </div>
  );
}

export function FileTree() {
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const tree = useStore((s) => s.tree);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState<null | "file" | "dir">(null);
  const [nameDraft, setNameDraft] = useState("");

  if (!sidebarOpen) return null;

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const confirmCreate = async () => {
    const name = nameDraft.trim();
    const kind = creating;
    setCreating(null);
    setNameDraft("");
    if (!name || !kind) return;
    try {
      await useStore.getState().createItem("", name, kind);
    } catch (e) {
      alert(`creazione fallita: ${e}`);
    }
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarToolbar}>
        <button title="Nuovo file" onClick={() => { setCreating("file"); setNameDraft(""); }}>
          + file
        </button>
        <button title="Nuova cartella" onClick={() => { setCreating("dir"); setNameDraft(""); }}>
          + cartella
        </button>
        <button title="Aggiorna" onClick={() => useStore.getState().refreshTree()}>
          ↻
        </button>
      </div>
      {creating && (
        <input
          className={styles.treeInput}
          autoFocus
          placeholder={creating === "file" ? "nome-file.tex" : "nome-cartella"}
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={confirmCreate}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirmCreate();
            if (e.key === "Escape") { setCreating(null); setNameDraft(""); }
          }}
        />
      )}
      <div className={styles.treeScroll}>
        {tree.length === 0 && <p className={styles.treeEmpty}>Cartella vuota</p>}
        {tree.map((n) => (
          <Row key={n.path} node={n} depth={0} expanded={expanded} toggle={toggle} />
        ))}
      </div>
    </aside>
  );
}

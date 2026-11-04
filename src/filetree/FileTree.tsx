// Project file tree: navigation, creation, rename, delete via context menu.

import { useEffect, useState, type MouseEvent } from "react";

import { ConfirmDialog, PromptDialog } from "../components/Dialogs";
import { useAppStore } from "../state/store";
import type { FileEntry } from "../types";
import { basename, dirname, joinPath } from "../utils/misc";

interface CtxMenuState {
  x: number;
  y: number;
  target: FileEntry;
}

type DialogState =
  | { kind: "newFile"; parent: string }
  | { kind: "newDir"; parent: string }
  | { kind: "rename"; path: string; name: string };

function FileTree(): JSX.Element {
  const tree = useAppStore((s) => s.tree);
  const projectRoot = useAppStore((s) => s.projectRoot);
  const createEntry = useAppStore((s) => s.createEntry);
  const renameEntry = useAppStore((s) => s.renameEntry);
  const deleteEntry = useAppStore((s) => s.deleteEntry);
  const refreshTree = useAppStore((s) => s.refreshTree);
  const collapseAllDirs = useAppStore((s) => s.collapseAllDirs);
  const openFile = useAppStore((s) => s.openFile);

  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ path: string; name: string } | null>(null);

  // close the context menu on any click outside of it
  useEffect(() => {
    if (!ctxMenu) return;
    const close = (): void => setCtxMenu(null);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [ctxMenu]);

  const onContext = (e: MouseEvent, node: FileEntry): void => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, target: node });
  };

  const confirmDialog = (): JSX.Element | null => {
    if (!confirmDelete) return null;
    return (
      <ConfirmDialog
        title="Eliminare?"
        message={`Eliminare definitivamente '${confirmDelete.name}'?${
          "" /* the Rust layer only removes inside the project */
        }`}
        confirmLabel="Elimina"
        danger
        onConfirm={() => {
          void deleteEntry(confirmDelete.path);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    );
  };

  const promptDialog = (): JSX.Element | null => {
    if (!dialog) return null;
    if (dialog.kind === "rename") {
      return (
        <PromptDialog
          title="Rinomina"
          hint={`Nuovo nome per '${dialog.name}'.`}
          label="Nome"
          initial={dialog.name}
          confirmLabel="Rinomina"
          onConfirm={(value) => {
            const parent = dirname(dialog.path);
            const newPath = joinPath(parent, value);
            void renameEntry(dialog.path, newPath);
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        />
      );
    }
    const isDir = dialog.kind === "newDir";
    return (
      <PromptDialog
        title={isDir ? "Nuova cartella" : "Nuovo file"}
        hint={`Verrà creato in ${basename(dialog.parent) || "radice del progetto"}.`}
        label={isDir ? "Nome della cartella" : "Nome del file"}
        initial={isDir ? "" : ".tex"}
        confirmLabel="Crea"
        onConfirm={(value) => {
          const path = joinPath(dialog.parent, value);
          void createEntry(path, isDir).then(() => {
            if (!isDir) void openFile(path);
          });
          setDialog(null);
        }}
        onCancel={() => setDialog(null)}
      />
    );
  };

  const ctxMenuEl = (): JSX.Element | null => {
    if (!ctxMenu) return null;
    const { target } = ctxMenu;
    const items: Array<{ label: string; danger?: boolean; action: () => void }> = [];
    if (target.isDir) {
      items.push({
        label: "Nuovo file",
        action: () => setDialog({ kind: "newFile", parent: target.path }),
      });
      items.push({
        label: "Nuova cartella",
        action: () => setDialog({ kind: "newDir", parent: target.path }),
      });
    }
    items.push({
      label: "Rinomina",
      action: () => setDialog({ kind: "rename", path: target.path, name: target.name }),
    });
    items.push({
      label: "Elimina",
      danger: true,
      action: () => setConfirmDelete({ path: target.path, name: target.name }),
    });
    return (
      <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
        {items.map((item) => (
          <button
            key={item.label}
            className={item.danger ? "ctx-danger" : undefined}
            onClick={() => {
              setCtxMenu(null);
              item.action();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="tree-header">
        <span className="tree-title">File</span>
        <button
          className="btn btn-ghost btn-small"
          title="Nuovo file nella radice del progetto"
          onClick={() => setDialog({ kind: "newFile", parent: projectRoot ?? "" })}
        >
          + File
        </button>
        <button
          className="btn btn-ghost btn-small"
          title="Nuova cartella nella radice del progetto"
          onClick={() => setDialog({ kind: "newDir", parent: projectRoot ?? "" })}
        >
          + Cartella
        </button>
        <button
          className="btn btn-ghost btn-small"
          title="Aggiorna l'albero"
          onClick={() => void refreshTree()}
        >
          ⟳
        </button>
        <button
          className="btn btn-ghost btn-small"
          title="Comprimi tutte le cartelle"
          onClick={collapseAllDirs}
        >
          ▾▾
        </button>
      </div>
      <div className="tree-body">
        {tree.length === 0 ? (
          <div className="tree-empty">Cartella vuota.</div>
        ) : (
          tree.map((node) => <FileTreeItem key={node.path} node={node} depth={0} onContext={onContext} />)
        )}
      </div>
      {ctxMenuEl()}
      {promptDialog()}
      {confirmDialog()}
    </>
  );
}

function FileTreeItem(props: {
  node: FileEntry;
  depth: number;
  onContext: (e: MouseEvent, node: FileEntry) => void;
}): JSX.Element {
  const { node, depth } = props;
  const expanded = useAppStore((s) => s.expandedDirs[node.path] ?? false);
  const active = useAppStore((s) => s.activeTabPath === node.path);
  const toggleDir = useAppStore((s) => s.toggleDir);
  const openFile = useAppStore((s) => s.openFile);

  const onClick = (): void => {
    if (node.isDir) toggleDir(node.path);
    else void openFile(node.path);
  };

  return (
    <>
      <div
        className={`tree-row${active ? " active" : ""}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={onClick}
        onContextMenu={(e) => props.onContext(e, node)}
        title={node.path}
      >
        <span className="twist">{node.isDir ? (expanded ? "▾" : "▸") : ""}</span>
        <span className="row-icon">{node.isDir ? "" : "·"}</span>
        <span className="row-name">{node.name}</span>
      </div>
      {node.isDir &&
        expanded &&
        node.children?.map((child) => (
          <FileTreeItem key={child.path} node={child} depth={depth + 1} onContext={props.onContext} />
        ))}
    </>
  );
}

export default FileTree;

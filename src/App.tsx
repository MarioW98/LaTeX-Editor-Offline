import { useEffect } from "react";

import StatusBar from "./components/StatusBar";
import Toolbar from "./components/Toolbar";
import EditorTabs from "./editor/EditorTabs";
import CodeEditor from "./editor/CodeEditor";
import FileTree from "./filetree/FileTree";
import NewProjectDialog from "./features/project/NewProjectDialog";
import ProjectPicker from "./features/project/ProjectPicker";
import OutputPanel from "./features/build/OutputPanel";
import SettingsDialog from "./features/settings/SettingsDialog";
import PdfViewer from "./pdf/PdfViewer";
import { useAppStore } from "./state/store";
import * as ipc from "./tauri/ipc";

export default function App(): JSX.Element {
  const theme = useAppStore((s) => s.globalSettings.theme);
  const projectRoot = useAppStore((s) => s.projectRoot);
  const settingsOpen = useAppStore((s) => s.ui.settingsOpen);
  const newProjectOpen = useAppStore((s) => s.ui.newProjectOpen);
  const bootstrap = useAppStore((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();

    const unOutput = ipc.onBuildLine((ev) => useAppStore.getState().appendBuildLine(ev));
    const unFinished = ipc.onBuildFinished((ev) => useAppStore.getState().finishBuild(ev));

    const onKeydown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void useAppStore.getState().saveActiveTab();
      }
    };
    window.addEventListener("keydown", onKeydown);

    const onFocus = (): void => void useAppStore.getState().checkExternalChanges();
    window.addEventListener("focus", onFocus);
    const interval = setInterval(() => void useAppStore.getState().checkExternalChanges(), 30000);

    return () => {
      void unOutput.then((f) => f());
      void unFinished.then((f) => f());
      window.removeEventListener("keydown", onKeydown);
      window.removeEventListener("focus", onFocus);
      clearInterval(interval);
    };
  }, [bootstrap]);

  return (
    <div className="app" data-theme={theme}>
      <Toolbar />
      {projectRoot ? <Workspace /> : <ProjectPicker />}
      <StatusBar />
      {settingsOpen && <SettingsDialog />}
      {newProjectOpen && <NewProjectDialog />}
      <ExternalChangesDialog />
    </div>
  );
}

function Workspace(): JSX.Element {
  const ui = useAppStore((s) => s.ui);
  const cols = [
    ui.leftPanel ? "250px" : null,
    "1fr",
    ui.rightPanel ? "minmax(280px, 42%)" : null,
  ]
    .filter((c): c is string => c !== null)
    .join(" ");
  const rows = ["auto", "1fr", ui.bottomPanel ? "230px" : null]
    .filter((r): r is string => r !== null)
    .join(" ");

  return (
    <div className="workspace" style={{ gridTemplateColumns: cols }}>
      {ui.leftPanel && (
        <aside className="panel panel-left">
          <FileTree />
        </aside>
      )}
      <section className="center" style={{ gridTemplateRows: rows }}>
        <EditorTabs />
        <div className="editor-host">
          <CodeEditor />
        </div>
        {ui.bottomPanel && (
          <div className="panel panel-bottom">
            <OutputPanel />
          </div>
        )}
      </section>
      {ui.rightPanel && (
        <aside className="panel panel-right">
          <PdfViewer />
        </aside>
      )}
    </div>
  );
}

function ExternalChangesDialog(): JSX.Element | null {
  const externalChanges = useAppStore((s) => s.externalChanges);
  const tabs = useAppStore((s) => s.tabs);
  const reloadExternalFiles = useAppStore((s) => s.reloadExternalFiles);
  const dismissExternalChanges = useAppStore((s) => s.dismissExternalChanges);

  if (externalChanges.length === 0) return null;

  const reload = (): void => {
    void reloadExternalFiles(externalChanges.map((c) => c.path));
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal={true} aria-label="File modificati all'esterno">
        <h3>File modificati all&apos;esterno</h3>
        <p className="dialog-hint">
          Questi file sono cambiati su disco mentre erano aperti nell&apos;editor:
        </p>
        <ul className="plain-list">
          {externalChanges.map((c) => {
            const tab = tabs.find((t) => t.path === c.path);
            const dirty = tab ? tab.content !== tab.savedContent : false;
            return (
              <li key={c.path}>
                <code>{c.name}</code>
                {dirty ? <span className="warn-text"> (con modifiche non salvate)</span> : null}
              </li>
            );
          })}
        </ul>
        <div className="dialog-actions">
          <button className="btn btn-primary" onClick={reload}>
            Ricarica dal disco
          </button>
          <button className="btn" onClick={dismissExternalChanges}>
            Mantieni le mie modifiche
          </button>
        </div>
      </div>
    </div>
  );
}

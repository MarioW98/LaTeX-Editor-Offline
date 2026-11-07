import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useStore } from "./state/store";
import { TopBar } from "./components/TopBar";
import { StatusBar } from "./components/StatusBar";
import { BuildStartDialog } from "./components/BuildStartDialog";
import { Welcome } from "./components/Welcome";
import { SettingsDialog } from "./components/SettingsDialog";
import { FileTree } from "./filetree/FileTree";
import { EditorPane } from "./editor/EditorPane";
import { OutputPanel } from "./build/OutputPanel";
import { PdfPreview } from "./pdf/PdfPreview";
import type { BuildFinishedPayload, LogLine } from "./types";
import styles from "./styles/layout.module.css";

export default function App() {
  const rootPath = useStore((s) => s.rootPath);
  const outputOpen = useStore((s) => s.outputOpen);
  const pdfOpen = useStore((s) => s.pdfOpen);

  useEffect(() => {
    useStore.getState().bootstrap();
  }, []);

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    let disposed = false;
    const registrations = [
      listen<LogLine>("build-output", (e) => useStore.getState().appendLog(e.payload)),
      listen<BuildFinishedPayload>("build-finished", (e) =>
        useStore.getState().setBuildFinished(e.payload),
      ),
    ];
    for (const p of registrations) {
      p.then((f) => {
        if (disposed) f();
        else unsubs.push(f);
      }).catch(() => undefined);
    }
    return () => {
      disposed = true;
      for (const f of unsubs) f();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F5") {
        e.preventDefault();
        useStore.getState().build();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!rootPath) {
    return (
      <>
        <Welcome />
        <SettingsDialog />
      </>
    );
  }

  return (
    <div className={styles.app}>
      <TopBar />
      <div className={styles.mainRow}>
        <FileTree />
        <EditorPane />
        {pdfOpen && <PdfPreview />}
      </div>
      {outputOpen && <OutputPanel />}
      <StatusBar />
      <SettingsDialog />
      <BuildStartDialog />
    </div>
  );
}

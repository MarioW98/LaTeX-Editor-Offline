/**
 * Layout principale:
 * toolbar · [filetree | editor(+tab) | pdf] con pannello build sotto l'editor · statusbar.
 * Pannelli ridimensionabili tramite splitter, output/PDF nascondibili.
 */
import { useEffect } from 'react';
import { Toolbar } from './components/Toolbar';
import { StatusBar } from './components/StatusBar';
import { Toasts } from './components/Toasts';
import { Splitter } from './components/Splitter';
import { FileTree } from './filetree/FileTree';
import { TabBar } from './editor/TabBar';
import { CodeEditor } from './editor/CodeEditor';
import { EmptyEditor } from './editor/EmptyEditor';
import { useAutosave } from './editor/useAutosave';
import { useExternalChanges } from './editor/useExternalChanges';
import { BuildPanel } from './build/BuildPanel';
import { useBuildEvents } from './build/useBuildEvents';
import { PdfPanel } from './pdf/PdfPanel';
import { WelcomeScreen } from './features/welcome/WelcomeScreen';
import { NewProjectDialog } from './features/newproject/NewProjectDialog';
import { FileChangeDialog } from './features/filechange/FileChangeDialog';
import { SettingsModal } from './settings/SettingsModal';
import { effectiveOf, useSettingsStore } from './state/useSettingsStore';
import { useProjectStore } from './state/useProjectStore';
import { useEditorStore } from './state/useEditorStore';
import { useBuildStore } from './state/useBuildStore';
import { useUiStore } from './state/useUiStore';

export default function App(): JSX.Element {
  const ready = useSettingsStore((s) => s.ready);
  const theme = useSettingsStore((s) => s.global.theme);
  const global = useSettingsStore((s) => s.global);
  const projectMeta = useSettingsStore((s) => s.project);
  const root = useProjectStore((s) => s.root);
  const tabsCount = useEditorStore((s) => s.tabs.length);

  const showOutput = useUiStore((s) => s.showOutput);
  const showPdf = useUiStore((s) => s.showPdf);
  const sidebarWidth = useUiStore((s) => s.sidebarWidth);
  const pdfWidth = useUiStore((s) => s.pdfWidth);
  const bottomHeight = useUiStore((s) => s.bottomHeight);
  const setSidebarWidth = useUiStore((s) => s.setSidebarWidth);
  const setPdfWidth = useUiStore((s) => s.setPdfWidth);
  const setBottomHeight = useUiStore((s) => s.setBottomHeight);

  useBuildEvents();
  useAutosave();
  useExternalChanges();

  // Caricamento impostazioni + rilevamento LaTeX (una sola volta).
  useEffect(() => {
    void useSettingsStore.getState().init();
  }, []);

  // Applicazione del tema.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Chiusura progetto → tab editor chiuse.
  useEffect(() => {
    if (root == null) {
      useEditorStore.getState().closeAll();
      useBuildStore.getState().clearOutput();
    }
  }, [root]);

  // Scorciatoie globali: Ctrl/Cmd+S salva, Ctrl/Cmd+B compila/annnulla.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 's') {
        e.preventDefault();
        void useEditorStore.getState().saveActive();
      } else if (k === 'b') {
        e.preventDefault();
        const build = useBuildStore.getState();
        if (build.running) void build.cancel();
        else void build.start();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!ready) {
    return <div className="boot">Caricamento impostazioni…</div>;
  }

  const eff = effectiveOf(global, projectMeta);
  const shellEscapeBanner = global.allowShellEscape && eff.warnShellEscape;

  const columns = showPdf
    ? `${sidebarWidth}px 4px minmax(200px, 1fr) 4px ${pdfWidth}px`
    : `${sidebarWidth}px 4px minmax(200px, 1fr)`;
  const rows = showOutput ? `minmax(120px, 1fr) 4px ${bottomHeight}px` : 'minmax(120px, 1fr)';

  return (
    <div className="app">
      <Toolbar />

      {shellEscapeBanner && (
        <div className="banner-warn" role="alert">
          shell-escape è attivo: i documenti possono eseguire comandi in compilazione. Disattivalo
          nelle impostazioni se non è strettamente necessario.
        </div>
      )}

      {root != null ? (
        <div className="layout" style={{ gridTemplateColumns: columns, gridTemplateRows: rows }}>
          <div className="pane pane-sidebar" style={{ gridColumn: '1', gridRow: '1 / -1' }}>
            <FileTree />
          </div>
          <div style={{ gridColumn: '2', gridRow: '1 / -1' }}>
            <Splitter orientation="v" onDelta={(d) => setSidebarWidth(sidebarWidth + d)} />
          </div>
          <div className="pane pane-editor" style={{ gridColumn: '3', gridRow: '1' }}>
            {tabsCount > 0 ? (
              <>
                <TabBar />
                <CodeEditor />
              </>
            ) : (
              <EmptyEditor />
            )}
          </div>
          {showOutput && (
            <>
              <div style={{ gridColumn: '3', gridRow: '2' }}>
                <Splitter orientation="h" onDelta={(d) => setBottomHeight(bottomHeight - d)} />
              </div>
              <div className="pane pane-bottom" style={{ gridColumn: '3', gridRow: '3' }}>
                <BuildPanel />
              </div>
            </>
          )}
          {showPdf && (
            <>
              <div style={{ gridColumn: '4', gridRow: '1 / -1' }}>
                <Splitter orientation="v" onDelta={(d) => setPdfWidth(pdfWidth - d)} />
              </div>
              <div className="pane pane-pdf" style={{ gridColumn: '5', gridRow: '1 / -1' }}>
                <PdfPanel />
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="layout-welcome">
          <WelcomeScreen />
        </div>
      )}

      <StatusBar />

      <SettingsModal />
      <NewProjectDialog />
      <FileChangeDialog />
      <Toasts />
    </div>
  );
}

import { useAppStore } from "../state/store";

function EditorTabs(): JSX.Element {
  const tabs = useAppStore((s) => s.tabs);
  const active = useAppStore((s) => s.activeTabPath);
  const activateTab = useAppStore((s) => s.activateTab);
  const closeTab = useAppStore((s) => s.closeTab);

  return (
    <div className="editor-tabs" role="tablist">
      {tabs.map((t) => {
        const dirty = t.content !== t.savedContent;
        return (
          <div
            key={t.path}
            role="tab"
            aria-selected={t.path === active}
            className={`tab${t.path === active ? " active" : ""}`}
            title={t.path}
            onClick={() => activateTab(t.path)}
          >
            <span className="tab-name">{t.name}</span>
            {dirty && <span className="tab-dirty" title="Modifiche non salvate" />}
            <button
              className="tab-close"
              title="Chiudi"
              aria-label={`Chiudi ${t.name}`}
              onClick={(e) => {
                e.stopPropagation();
                closeTab(t.path);
              }}
            >
              ×
            </button>
          </div>
        );
      })}
      {tabs.length === 0 && (
        <div className="tab" style={{ cursor: "default", color: "var(--text-dim)" }}>
          Nessun file aperto
        </div>
      )}
    </div>
  );
}

export default EditorTabs;

/** Barra delle tab dell'editor. */
import { useEditorStore } from '../state/useEditorStore';

export function TabBar(): JSX.Element | null {
  const tabs = useEditorStore((s) => s.tabs);
  const activePath = useEditorStore((s) => s.activePath);
  const activate = useEditorStore((s) => s.activate);
  const close = useEditorStore((s) => s.close);

  if (tabs.length === 0) return null;

  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => {
        const active = t.path === activePath;
        return (
          <div
            key={t.path}
            role="tab"
            aria-selected={active}
            className={`tab${active ? ' tab-active' : ''}`}
            title={t.rel}
            onClick={() => activate(t.path)}
            onAuxClick={(e) => {
              if (e.button === 1) void close(t.path);
            }}
          >
            <span className="tab-name">{t.name}</span>
            {t.dirty && <span className="tab-dot" title="modificato" />}
            <button
              className="tab-close"
              aria-label={`Chiudi ${t.name}`}
              onClick={(e) => {
                e.stopPropagation();
                void close(t.path);
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}

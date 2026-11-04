/** Autosave con debounce: salva tutte le tab dirty dopo un periodo di inattività. */
import { useEffect } from 'react';
import { useEditorStore } from '../state/useEditorStore';
import { effectiveOf, useSettingsStore } from '../state/useSettingsStore';

export function useAutosave(): void {
  const global = useSettingsStore((s) => s.global);
  const project = useSettingsStore((s) => s.project);
  const eff = effectiveOf(global, project);
  const dirtyKey = useEditorStore((s) => s.tabs.filter((t) => t.dirty).map((t) => t.rel).join('|'));

  useEffect(() => {
    if (!eff.autosave || dirtyKey === '') return;
    const timer = setTimeout(() => {
      void useEditorStore.getState().saveAllDirty();
    }, eff.autosaveDelayMs);
    return () => clearTimeout(timer);
  }, [dirtyKey, eff.autosave, eff.autosaveDelayMs]);
}

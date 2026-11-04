/** Impostazioni: globali (profilo app) e progetto corrente (.latex-editor/project.json). */
import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Modal } from '../components/Modal';
import { useSettingsStore } from '../state/useSettingsStore';
import { useProjectStore } from '../state/useProjectStore';
import { useBuildStore } from '../state/useBuildStore';
import { useUiStore } from '../state/useUiStore';
import type { EngineId, GlobalSettings, ProjectMeta, ProjectLocalSettings } from '../utils/ipc';

export function SettingsModal(): JSX.Element | null {
  const openFlag = useUiStore((s) => s.settingsOpen);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const saveGlobal = useSettingsStore((s) => s.saveGlobal);
  const recheckLatex = useSettingsStore((s) => s.recheckLatex);
  const updateMeta = useProjectStore((s) => s.updateMeta);
  const running = useBuildStore((s) => s.running);

  const [draft, setDraft] = useState<GlobalSettings>(() => useSettingsStore.getState().global);
  const [pDraft, setPDraft] = useState<ProjectMeta | null>(() => useProjectStore.getState().meta);
  const [savedNote, setSavedNote] = useState('');

  // Reset del draft a ogni apertura.
  useEffect(() => {
    if (openFlag) {
      setDraft(useSettingsStore.getState().global);
      setPDraft(useProjectStore.getState().meta);
      setSavedNote('');
    }
  }, [openFlag]);

  if (!openFlag) return null;

  const g = <K extends keyof GlobalSettings>(key: K, value: GlobalSettings[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const p = <K extends keyof ProjectMeta>(key: K, value: ProjectMeta[K]) =>
    setPDraft((m) => (m ? { ...m, [key]: value } : m));
  const ps = (patch: Partial<ProjectLocalSettings>) =>
    setPDraft((m) => (m ? { ...m, settings: { ...m.settings, ...patch } } : m));

  const saveGlobalNow = async () => {
    try {
      await saveGlobal(draft);
      await recheckLatex();
      setSavedNote('Impostazioni globali salvate.');
    } catch {
      setSavedNote('Salvataggio globali fallito.');
    }
  };

  const saveProjectNow = async () => {
    if (!pDraft) return;
    await updateMeta(pDraft);
    setSavedNote('Impostazioni progetto salvate.');
  };

  const close = () => setSettingsOpen(false);

  return (
    <Modal title="Impostazioni" onClose={close} wide>
      <div className="settings">
        <section className="settings-section">
          <h3>Generali (tutti i progetti)</h3>

          <label className="field">
            <span>Cartella bin LaTeX o eseguibile (opzionale)</span>
            <div className="np-folder">
              <input
                value={draft.latexBinDir ?? ''}
                placeholder="es. /usr/local/texlive/2025/bin/universal-darwin"
                onChange={(e) => g('latexBinDir', e.target.value || null)}
              />
              <button
                className="btn"
                onClick={() => {
                  void (async () => {
                    const dir = await open({
                      directory: true,
                      multiple: false,
                      title: 'Cartella bin LaTeX',
                    });
                    if (typeof dir === 'string') g('latexBinDir', dir);
                  })();
                }}
              >
                Scegli…
              </button>
            </div>
          </label>

          <div className="field-row">
            <label className="field">
              <span>Motore predefinito (nuovi progetti)</span>
              <select
                value={draft.defaultEngine}
                onChange={(e) => g('defaultEngine', e.target.value as EngineId)}
              >
                <option value="pdflatex">pdflatex</option>
                <option value="xelatex">xelatex</option>
                <option value="lualatex">lualatex</option>
              </select>
            </label>
            <label className="field">
              <span>Tema</span>
              <select
                value={draft.theme}
                onChange={(e) => g('theme', e.target.value === 'light' ? 'light' : 'dark')}
              >
                <option value="dark">Scuro</option>
                <option value="light">Chiaro</option>
              </select>
            </label>
          </div>

          <h3 className="settings-sub">Editor</h3>
          <div className="field-row">
            <label className="field field-check">
              <input
                type="checkbox"
                checked={draft.autosave}
                onChange={(e) => g('autosave', e.target.checked)}
              />
              <span>Autosalvataggio</span>
            </label>
            <label className="field">
              <span>Ritardo autosave (ms)</span>
              <input
                type="number"
                min={300}
                max={10000}
                step={100}
                value={draft.autosaveDelayMs}
                onChange={(e) => g('autosaveDelayMs', Math.max(100, Number(e.target.value) || 1500))}
              />
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Dimensione font editor (px)</span>
              <input
                type="number"
                min={10}
                max={28}
                step={1}
                value={draft.editorFontSize}
                onChange={(e) => g('editorFontSize', Math.min(28, Math.max(10, Number(e.target.value) || 14)))}
              />
            </label>
            <label className="field field-check">
              <input
                type="checkbox"
                checked={draft.wordWrap}
                onChange={(e) => g('wordWrap', e.target.checked)}
              />
              <span>Ritaglio righe (word wrap)</span>
            </label>
          </div>

          <h3 className="settings-sub">Sicurezza build</h3>
          <label className="field field-check">
            <input
              type="checkbox"
              checked={draft.warnShellEscape}
              onChange={(e) => g('warnShellEscape', e.target.checked)}
            />
            <span>Mostra l'avviso quando shell-escape è attivo</span>
          </label>
          <label className="field field-check">
            <input
              type="checkbox"
              checked={draft.allowShellEscape}
              onChange={(e) => g('allowShellEscape', e.target.checked)}
            />
            <span>Abilita -shell-escape (sconsigliato)</span>
          </label>
          {draft.allowShellEscape && (
            <p className="settings-warn">
              Attenzione: shell-escape permette al documento di eseguire comandi durante la
              compilazione. Attivalo solo su documenti fidati.
            </p>
          )}

          <div className="modal-actions">
            <button className="btn btn-build" onClick={() => void saveGlobalNow()}>
              Salva impostazioni globali
            </button>
          </div>
        </section>

        {pDraft && (
          <section className="settings-section">
            <h3>Progetto corrente</h3>

            <label className="field">
              <span>File principale (percorso relativo)</span>
              <input
                value={pDraft.mainFile}
                placeholder="main.tex"
                onChange={(e) => p('mainFile', e.target.value)}
              />
            </label>

            <label className="field">
              <span>Directory di output (percorso relativo)</span>
              <input
                value={pDraft.outputDir}
                placeholder=".latex-editor/build"
                onChange={(e) => p('outputDir', e.target.value)}
              />
            </label>

            <div className="field-row">
              <label className="field">
                <span>Motore</span>
                <select
                  value={pDraft.engine}
                  disabled={running}
                  onChange={(e) => p('engine', e.target.value as EngineId)}
                >
                  <option value="pdflatex">pdflatex</option>
                  <option value="xelatex">xelatex</option>
                  <option value="lualatex">lualatex</option>
                </select>
              </label>
              <label className="field field-check">
                <input
                  type="checkbox"
                  checked={pDraft.useLatexmk}
                  onChange={(e) => p('useLatexmk', e.target.checked)}
                />
                <span>Usa latexmk se disponibile</span>
              </label>
            </div>

            <h3 className="settings-sub">Override locali editor</h3>

            <OverrideCheck
              label="Autosalvataggio"
              checked={pDraft.settings.autosave ?? null}
              onChange={(v) => ps({ autosave: v })}
            />
            <OverrideNumber
              label="Ritardo autosave (ms)"
              value={pDraft.settings.autosaveDelayMs ?? null}
              fallback={draft.autosaveDelayMs}
              onChange={(v) => ps({ autosaveDelayMs: v })}
            />
            <OverrideNumber
              label="Dimensione font editor (px)"
              value={pDraft.settings.editorFontSize ?? null}
              fallback={draft.editorFontSize}
              onChange={(v) => ps({ editorFontSize: v })}
            />
            <OverrideCheck
              label="Ritaglio righe"
              checked={pDraft.settings.wordWrap ?? null}
              onChange={(v) => ps({ wordWrap: v })}
            />
            <OverrideCheck
              label="Avviso shell-escape"
              checked={pDraft.settings.warnShellEscape ?? null}
              onChange={(v) => ps({ warnShellEscape: v })}
            />

            <div className="modal-actions">
              <button className="btn btn-build" onClick={() => void saveProjectNow()}>
                Salva impostazioni progetto
              </button>
            </div>
          </section>
        )}

        {savedNote && <div className="settings-note">{savedNote}</div>}
      </div>
    </Modal>
  );
}

function OverrideCheck(props: {
  label: string;
  checked: boolean | null;
  onChange: (v: boolean | null) => void;
}): JSX.Element {
  const enabled = props.checked !== null;
  const value = props.checked ?? false;
  return (
    <div className="override-row">
      <label className="field field-check">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => props.onChange(e.target.checked ? value : null)}
        />
        <span>Override</span>
      </label>
      <label className={`field field-check${enabled ? '' : ' disabled'}`}>
        <input
          type="checkbox"
          disabled={!enabled}
          checked={value}
          onChange={(e) => props.onChange(e.target.checked)}
        />
        <span>{props.label}</span>
      </label>
    </div>
  );
}

function OverrideNumber(props: {
  label: string;
  value: number | null;
  fallback: number;
  onChange: (v: number | null) => void;
}): JSX.Element {
  const enabled = props.value !== null;
  return (
    <div className="override-row">
      <label className="field field-check">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => props.onChange(e.target.checked ? props.fallback : null)}
        />
        <span>Override</span>
      </label>
      <label className={`field${enabled ? '' : ' disabled'}`}>
        <span>{props.label}</span>
        <input
          type="number"
          disabled={!enabled}
          value={props.value ?? props.fallback}
          onChange={(e) => props.onChange(Number(e.target.value) || props.fallback)}
        />
      </label>
    </div>
  );
}

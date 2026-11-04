/** Store build: stato pipeline, output (ring buffer), issue, PDF corrente. */
import { create } from 'zustand';
import { ipc, errMsg, type BuildRequest, type BuildOutputEvent, type BuildStatusEvent, type Issue } from '../utils/ipc';
import { useProjectStore } from './useProjectStore';
import { useSettingsStore } from './useSettingsStore';
import { useToastStore } from './useToastStore';

const MAX_OUTPUT_LINES = 4000;

export interface PdfRef {
  /** Percorso assoluto del PDF (per ipc.readPdf). */
  path: string;
  rel: string;
  /** Sigillo anti-cache: cambia a ogni build riuscita. */
  stamp: string;
}

interface BuildStore {
  buildId: number | null;
  running: boolean;
  phase: string | null;
  output: string[];
  issues: Issue[];
  success: boolean | null;
  error: string | null;
  durationMs: number | null;
  pdf: PdfRef | null;
  /** true: mostro l'ultimo PDF valido ma l'ultima build è fallita. */
  pdfStale: boolean;
  start: () => Promise<void>;
  cancel: () => Promise<void>;
  clearOutput: () => void;
  applyOutput: (ev: BuildOutputEvent) => void;
  applyStatus: (ev: BuildStatusEvent) => void;
}

export const useBuildStore = create<BuildStore>()((set, get) => ({
  buildId: null,
  running: false,
  phase: null,
  output: [],
  issues: [],
  success: null,
  error: null,
  durationMs: null,
  pdf: null,
  pdfStale: false,

  start: async () => {
    const { meta } = useProjectStore.getState();
    const { global } = useSettingsStore.getState();
    if (!meta) {
      useToastStore.getState().push('error', 'Nessun progetto aperto.');
      return;
    }
    const req: BuildRequest = {
      mainFile: meta.mainFile,
      engine: meta.engine,
      useLatexmk: meta.useLatexmk,
      outputDir: meta.outputDir,
      allowShellEscape: global.allowShellEscape,
      latexBinDir: global.latexBinDir,
    };
    set({
      running: true,
      buildId: null,
      phase: 'avvio…',
      output: [],
      issues: [],
      success: null,
      error: null,
      durationMs: null,
    });
    try {
      const started = await ipc.startBuild(req);
      set({ buildId: started.buildId });
    } catch (e) {
      set({ running: false, phase: null, error: errMsg(e) });
      useToastStore.getState().push('error', `Build non avviata: ${errMsg(e)}`);
    }
  },

  cancel: async () => {
    try {
      await ipc.cancelBuild();
      set({ phase: 'annullamento…' });
    } catch (e) {
      useToastStore.getState().push('error', `Annullamento fallito: ${errMsg(e)}`);
    }
  },

  clearOutput: () => set({ output: [] }),

  applyOutput: (ev) => {
    const id = get().buildId;
    if (id != null && ev.buildId !== id) return;
    set((s) => {
      const lines = [...s.output, ev.text];
      return { output: lines.length > MAX_OUTPUT_LINES ? lines.slice(-MAX_OUTPUT_LINES) : lines };
    });
  },

  applyStatus: (ev) => {
    const id = get().buildId;
    if (id != null && ev.buildId !== id) return;

    if (ev.kind === 'started') {
      set({ running: true, phase: 'in corso' });
      return;
    }
    if (ev.kind === 'step') {
      if (ev.step) {
        set({ phase: ev.step });
        set((s) => ({ output: [...s.output, `— ${ev.step} —`] }));
      }
      return;
    }
    if (ev.kind === 'cancelled') {
      set({ running: false, phase: 'annullata', durationMs: ev.durationMs ?? null });
      return;
    }
    if (ev.kind === 'finished') {
      const success = ev.success === true;
      const issues = ev.issues ?? [];
      const prevPdf = get().pdf;
      const nextPdf: PdfRef | null =
        success && ev.pdfPath ? { path: ev.pdfPath, rel: ev.pdfRel ?? '', stamp: `${ev.buildId}-${Date.now()}` } : prevPdf;
      set({
        running: false,
        success,
        issues,
        error: ev.error ?? null,
        durationMs: ev.durationMs ?? null,
        phase: success ? 'completata' : 'fallita',
        pdf: nextPdf,
        pdfStale: !success && nextPdf != null,
      });
      const errCount = issues.filter((i) => i.severity === 'error').length;
      if (success) {
        useToastStore.getState().push('success', 'Build completata.');
      } else if (ev.error) {
        useToastStore.getState().push('error', `Build fallita: ${ev.error}`);
      } else if (errCount > 0) {
        useToastStore.getState().push('error', `Build fallita con ${errCount} errori.`);
      }
    }
  },
}));

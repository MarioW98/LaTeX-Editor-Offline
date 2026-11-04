/** Store UI: visibilità pannelli, dimensioni, modali. */
import { create } from 'zustand';

interface UiState {
  showOutput: boolean;
  showPdf: boolean;
  settingsOpen: boolean;
  newProjectOpen: boolean;
  sidebarWidth: number;
  pdfWidth: number;
  bottomHeight: number;
  toggleOutput: () => void;
  togglePdf: () => void;
  setSettingsOpen: (open: boolean) => void;
  setNewProjectOpen: (open: boolean) => void;
  setSidebarWidth: (w: number) => void;
  setPdfWidth: (w: number) => void;
  setBottomHeight: (h: number) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  showOutput: true,
  showPdf: true,
  settingsOpen: false,
  newProjectOpen: false,
  sidebarWidth: 250,
  pdfWidth: 460,
  bottomHeight: 200,

  toggleOutput: () => set((s) => ({ showOutput: !s.showOutput })),
  togglePdf: () => set((s) => ({ showPdf: !s.showPdf })),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setNewProjectOpen: (open) => set({ newProjectOpen: open }),

  setSidebarWidth: (w) => set({ sidebarWidth: Math.min(520, Math.max(170, Math.round(w))) }),
  setPdfWidth: (w) => set({ pdfWidth: Math.min(900, Math.max(260, Math.round(w))) }),
  setBottomHeight: (h) => set({ bottomHeight: Math.min(560, Math.max(110, Math.round(h))) }),
}));

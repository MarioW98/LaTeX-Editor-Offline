import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite configuration for the LaTeX Editor Offline frontend.
// The same bundle is used by `tauri dev` (dev server) and by the
// production desktop builds (frontendDist -> ../dist).
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: false,
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Configurazione Vite pensata per Tauri 2:
// - porta fissa e strictPort perché tauri.conf.json punta a http://localhost:5173
// - clearScreen false per non nascondere gli errori Rust/TS nel terminale
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});

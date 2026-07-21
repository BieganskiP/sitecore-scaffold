import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Ships inside the headcore npm package (cli "files" includes gui-dist).
    outDir: '../cli/gui-dist',
    emptyOutDir: true,
  },
  server: {
    // Dev HMR against a locally running `headcore gui --no-open`.
    proxy: { '/api': 'http://localhost:4646' },
  },
});

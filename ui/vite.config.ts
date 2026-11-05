import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The room serves what this builds (`staticDir` in its config), so in production the page and the API share an origin.
// In development this server proxies /api, and the skins a room serves from its own folder, to a room on :3100.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5175,
    proxy: { '/api': { target: 'http://127.0.0.1:3100' }, '/skins': { target: 'http://127.0.0.1:3100' } },
  },
  build: { outDir: 'dist', target: 'es2022' },
});

import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The API server runs on PORT (default 3000). In development Vite serves the
// client on 5174 and proxies API calls so the browser sees one origin.
const apiTarget = `http://localhost:${process.env.PORT ?? '3000'}`;

export default defineConfig({
  root: 'src/client',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: {
    port: 5174,
    strictPort: true,
    proxy: { '/api': apiTarget, '/healthz': apiTarget, '/readyz': apiTarget },
  },
  build: { outDir: '../../dist/client', emptyOutDir: true, sourcemap: true },
});

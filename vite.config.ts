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
    // To use the dev server from another machine: VITE_HOST=true exposes it on all
    // interfaces and VITE_ALLOWED_HOSTS lists the hostnames browsers will use (Vite blocks
    // unknown Host headers). Set APP_URL to that hostname too, or the API's Origin check
    // refuses state-changing requests.
    host: process.env.VITE_HOST === 'true' ? true : undefined,
    allowedHosts: process.env.VITE_ALLOWED_HOSTS
      ? process.env.VITE_ALLOWED_HOSTS.split(',')
      : undefined,
    proxy: { '/api': apiTarget, '/healthz': apiTarget, '/readyz': apiTarget },
  },
  build: { outDir: '../../dist/client', emptyOutDir: true, sourcemap: true },
});

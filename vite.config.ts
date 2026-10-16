import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // The Go API (server/, HTTP_ADDRESS=:8080 by default). Same origin for the browser, so the
    // session cookie and the WebAuthn origin check work in development as in production.
    proxy: {
      '/api': process.env.VITE_API_TARGET ?? 'http://127.0.0.1:8080',
    },
  },
});

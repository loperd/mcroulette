import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Dev over HTTPS through the Cloudflare tunnel (Telegram and passkeys need a real origin).
    allowedHosts: (process.env.VITE_ALLOWED_HOSTS ?? 'vault.loper.me').split(',').map(host => host.trim()).filter(Boolean),
    // The Go API (server/, HTTP_ADDRESS=:8080 by default). Same origin for the browser, so the
    // session cookie and the WebAuthn origin check work in development as in production.
    proxy: {
      '/api': process.env.VITE_API_TARGET ?? 'http://voxel-vault-voxel-vault.voxel-vault.svc.cluster.local:8080',
    },
  },
});

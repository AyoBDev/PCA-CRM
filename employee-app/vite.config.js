import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/employee/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'PCAlink Employee',
        short_name: 'PCAlink',
        start_url: '/employee/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#1e293b',
        background_color: '#ffffff',
        icons: [
          { src: '/employee/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/employee/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\/api\/employee\/.*/,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache', expiration: { maxEntries: 50, maxAgeSeconds: 300 } },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        // Preserve the browser's Host (e.g. nvbest.localhost) so the backend's
        // resolveAgency middleware resolves the right agency. The Vite shorthand
        // ('/api': 'http://localhost:4000') defaults to changeOrigin:true, which
        // rewrites Host to the target (localhost) and forces every request onto
        // the platform host — making agency (subdomain) logins 401. Mirrors the
        // admin client's proxy config.
        changeOrigin: false,
      },
      '/socket.io': { target: 'http://localhost:4000', ws: true, changeOrigin: false },
    },
  },
});

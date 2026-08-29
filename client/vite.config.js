import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    appType: 'spa',
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:4000',
                // Do NOT rewrite Host — the backend resolves the agency from the
                // subdomain (e.g. nvbest.localhost) via resolveAgency.js. With
                // changeOrigin:true, Vite rewrites Host to localhost:4000 and every
                // request looks like the platform/apex host, so the agency login
                // never renders in local dev.
                changeOrigin: false,
            },
        },
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    xlsx: ['xlsx'],
                },
            },
        },
    },
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: './src/test/setup.js',
    },
});

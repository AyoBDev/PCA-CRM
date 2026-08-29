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
                // Preserve the browser's Host (e.g. nvbest.localhost) so the
                // API's tenant resolver (resolveAgency) maps the request to the
                // right agency. changeOrigin:true would rewrite it to the target
                // host (localhost) and force every request onto the platform host.
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

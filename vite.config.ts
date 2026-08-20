/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        agent: resolve(__dirname, 'agent.html'),
        author: resolve(__dirname, 'author.html'),
      },
    },
  },
  optimizeDeps: {
    // Vite pre-bundles dependencies and caches the result. When either SDK is linked to a
    // local checkout (see "Working on the SDKs" in the README), that cache hides changes
    // until it is cleared. Excluding them keeps a watch build visible on reload.
    exclude: ['@gramaziokohler/antikythera-ts', '@gramaziokohler/compas-pb-ts'],
  },
  server: {
    port: 5174,
    proxy: {
      // Target is your backend API
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.tsx'],
  },
})

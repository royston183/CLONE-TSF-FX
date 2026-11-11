import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const GATEWAY = process.env.GATEWAY_URL ?? 'http://127.0.0.1:8080'

// In development Vite serves the app and forwards the gateway's routes to it, so the
// browser still sees ONE origin. That keeps the same-origin guarantee the old per-console
// proxy.py had, and means no CORS configuration is ever needed on the SAP Gateway.
const at = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  plugins: [react()],
  // The TSF_FX screens (src/tsfx) import each other as @tsfx/*, and the application's own sign-in as @web/*.
  resolve: {
    alias: [
      { find: /^@tsfx-entry$/, replacement: at('./src/tsfx/entry.tsx') },
      { find: /^@tsfx\//, replacement: at('./src/tsfx/') },
      { find: /^@web\//, replacement: at('./src/') },
    ],
  },
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      ['/api', '/auth', '/config'].map((prefix) => [prefix, { target: GATEWAY, changeOrigin: true }]),
    ),
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Each application is its own lazy chunk, so opening the launcher does not download
        // Invoice's 4,000 lines. React itself is split out and shared across all of them.
        manualChunks: (id) => (id.includes('node_modules/react') ? 'react-vendor' : undefined),
      },
    },
  },
})

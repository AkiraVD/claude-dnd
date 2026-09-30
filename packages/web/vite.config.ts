import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  build: { outDir: 'dist', emptyOutDir: true },
  esbuild: { jsx: 'automatic' },
  server: {
    proxy: {
      '/ws': { target: 'ws://localhost:5173', ws: true },
      '/api': 'http://localhost:5173',
    },
  },
})

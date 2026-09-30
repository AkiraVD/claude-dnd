import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  // Aliased to source rather than built output: the engine is consumed as TS
  // everywhere for now. Real builds arrive when the server needs them (phase 5).
  resolve: {
    alias: {
      '@dnd/content': src('./packages/content/src/index.ts'),
      '@dnd/engine': src('./packages/engine/src/index.ts'),
      '@dnd/mcp': src('./packages/mcp/src/index.ts'),
    },
  },
  test: {
    globals: true,
    include: ['packages/*/src/**/*.test.ts'],
  },
})

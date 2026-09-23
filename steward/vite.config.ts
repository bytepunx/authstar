import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  server: {
    port: 5173,
  },
})

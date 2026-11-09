import adapter from '@sveltejs/adapter-node'
import { sveltekit } from '@sveltejs/kit/vite'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    // SvelteKit 3 takes its configuration here; it no longer reads svelte.config.js.
    sveltekit({
      preprocess: vitePreprocess(),
      // adapter-node: steward runs as a plain long-lived Node process reached
      // only via direct port-forward (no public ingress, no CDN/edge target),
      // so a self-contained Node server is the right shape -- not
      // adapter-auto's static/serverless guess.
      adapter: adapter(),
    }),
  ],
  test: {
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  server: {
    port: 5173,
  },
})

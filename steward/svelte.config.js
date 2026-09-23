import adapter from '@sveltejs/adapter-node'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // adapter-node: steward runs as a plain long-lived Node process reached
    // only via direct port-forward (no public ingress, no CDN/edge target),
    // so a self-contained Node server is the right shape -- not
    // adapter-auto's static/serverless guess.
    adapter: adapter(),
  },
}

export default config

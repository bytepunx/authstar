import adapter from '@sveltejs/adapter-node'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    // Hosted pages (Story 010) live under src/routes/(hosted) -- a route
    // group, not a URL segment, so /oauth2/select etc. stay at the paths
    // portcullis proxies to rather than nesting under /hosted.
    alias: {
      $widgets: 'src/widgets',
    },
  },
}

export default config

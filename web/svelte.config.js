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
    paths: {
      // SvelteKit's default (true) emits relative asset URLs
      // (`../_app/...`) so one build can be served from an unknown mount
      // path -- doesn't apply here, since every tenant's `_admin`
      // application is always served at its own domain's root. Relative
      // mode miscounted the `../` depth needed for
      // /billing/plan-mappings/new (3 segments) -- the first route this
      // deep to actually get exercised -- landing the browser on
      // /billing/_app/... (404) instead of /_app/.... Absolute paths sidestep
      // that whole class of depth-counting bug.
      relative: false,
    },
  },
}

export default config

import adapter from '@sveltejs/adapter-node'
import type { Config } from '@sveltejs/kit/vite'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

// SvelteKit's configuration, passed to the `sveltekit(...)` plugin by both
// vite.config.ts and vitest.config.ts. SvelteKit 3 no longer reads
// svelte.config.js, so this module is the one place it is written.
export const kitConfig: Config = {
  preprocess: vitePreprocess(),
  adapter: adapter(),
  alias: {
    // SvelteKit 3 removed the built-in `$lib` alias in favour of `#lib`
    // subpath imports. Declaring it here keeps the existing `$lib/...`
    // imports working; the option is deprecated, so moving them to `#lib`
    // is a follow-up.
    $lib: 'src/lib',
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
}

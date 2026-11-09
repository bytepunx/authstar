import { svelte } from '@sveltejs/vite-plugin-svelte'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// jsdom-environment vitest config: spec/components holds two different
// kinds of "component contract" test --
//  - the embeddable Web Components (src/widgets/**) instantiated directly
//    as custom elements, no framework involved (they have none at runtime);
//  - a handful of the admin app's own Svelte components (e.g. the nav)
//    rendered via @testing-library/svelte, where testing the rendered
//    output directly is clearer than going through a full route.
export default defineConfig({
  plugins: [svelte({ compilerOptions: { dev: true } })],
  // Without this, Vite resolves `svelte` via its default (server/node)
  // package export condition even under a jsdom test environment, which
  // compiles components in SSR mode -- `mount()` (what
  // @testing-library/svelte actually calls) only exists in Svelte's
  // client-side runtime. This is vite-plugin-svelte's own documented fix.
  // `$app/state` is SvelteKit's virtual module, and this tier runs without
  // SvelteKit's plugin, so it resolves to a stand-in the specs mock.
  resolve: {
    conditions: ['browser'],
    alias: {
      '$app/state': fileURLToPath(new URL('./spec/fixtures/app-state.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['spec/components/**/*.spec.ts'],
    setupFiles: ['spec/components/setup.ts'],
    testTimeout: 15_000,
  },
})

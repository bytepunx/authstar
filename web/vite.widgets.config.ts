import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const widgetsEntry = fileURLToPath(new URL('src/widgets/index.ts', import.meta.url))

// Story 011 / tech-stack.md: a genuinely separate build target from the
// SvelteKit admin app -- framework-agnostic output (Vite library mode), no
// `@sveltejs/kit` plugin, no Svelte runtime shipped. Adopting applications
// load this as a single dependency-free script tag, not the SvelteKit app.
export default defineConfig({
  build: {
    outDir: 'dist-widgets',
    emptyOutDir: true,
    lib: {
      entry: widgetsEntry,
      name: 'AuthstarWidgets',
      formats: ['es', 'iife'],
      fileName: (format) => (format === 'iife' ? 'authstar-widgets.js' : 'authstar-widgets.esm.js'),
    },
    rollupOptions: {
      // No externals -- the whole point is a dependency-free script tag;
      // this library has no runtime dependencies to externalize anyway
      // (plain Custom Elements, no framework).
    },
  },
})

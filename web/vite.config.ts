import tailwindcss from '@tailwindcss/vite'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

// The admin app + hosted pages' own SvelteKit build -- the widget library
// (Story 011) is a deliberately separate Vite build target, see
// vite.widgets.config.ts, not part of this config at all (ADR 0072,
// tech-stack.md: framework-agnostic output, no SvelteKit runtime).
export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
})

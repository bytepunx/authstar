/**
 * Tailwind v4 auto-detects content via `@tailwindcss/vite` -- this file
 * exists mainly for editor tooling that expects it and to make the admin
 * app's own content scope explicit. Only the SvelteKit admin app uses
 * Tailwind (src/routes, src/lib/components); the widget library
 * (src/widgets) never does, by design (ADR 0044/0072 -- plain CSS custom
 * properties only, since widgets ship into host pages with no build step).
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./src/routes/**/*.{svelte,ts}', './src/lib/components/**/*.svelte'],
}

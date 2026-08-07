import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vitest/config'

// Node-environment vitest config: spec/behavior (SvelteKit +page.server.ts /
// +server.ts load-function and form-action contract tests, backend calls
// faked via injected clients -- no DOM needed) and spec/integration (same
// server code, but over real HTTP against a lightweight fake tower/keep
// standing in for the real services -- see TESTING.md for why this is the
// right shape for web's "integration" tier). Widget/component tests need a
// DOM and live in vitest.components.config.ts instead.
export default defineConfig({
  plugins: [sveltekit()],
  test: {
    environment: 'node',
    include: ['spec/behavior/**/*.spec.ts', 'spec/integration/**/*.spec.ts'],
    testTimeout: 15_000,
  },
})

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Integration tests spin up a real RabbitMQ container (testcontainers) --
    // generous timeout so a slow image pull/start doesn't flake the run.
    // Behavior and e2e tests run entirely against the fake publisher and
    // finish in milliseconds, so this ceiling never matters for them.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  }
})

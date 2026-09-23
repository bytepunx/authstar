import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Integration tests spin up real containers (testcontainers) -- generous
    // timeout so a slow ClickHouse/RabbitMQ pull/start doesn't flake the run.
    // Behavior and e2e tests run entirely against in-memory fakes and finish
    // in milliseconds, so this ceiling never matters for them.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})

import { defineConfig, devices } from '@playwright/test'

const STEWARD_PORT = 4611
const TOWER_URL = 'http://127.0.0.1:4610'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${STEWARD_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Two real, separate processes: the fake tower backend (fixed port
  // 4610), and the real built steward server (adapter-node's
  // build/index.js) pointed at it via TOWER_URL. Playwright's own
  // dependency ordering starts them in array order and waits for each
  // port before moving on -- the fake backend must be up before steward's
  // process, since nothing here retries a failed startup fetch.
  webServer: [
    {
      command: 'npx tsx tests/e2e/run-fake-backend.ts',
      port: 4610,
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
    },
    {
      command: 'node build/index.js',
      port: STEWARD_PORT,
      env: {
        PORT: String(STEWARD_PORT),
        HOST: '127.0.0.1',
        TOWER_URL,
      },
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
    },
  ],
})

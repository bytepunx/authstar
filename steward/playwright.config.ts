import { execFileSync } from 'node:child_process'
import { defineConfig, devices } from '@playwright/test'

// The ports are picked per run, never fixed: a fixed port lets one
// worktree's run reach another worktree's server and test the other
// branch's build (I-0010). STEWARD_E2E_TOWER_PORT and STEWARD_E2E_PORT
// choose them; when either is unset, this config picks two free loopback
// ports and sets both in process.env. The runner evaluates this config
// first, and its workers and webServer processes inherit its environment,
// so every process of one run reads the same ports.

// Listens on two ephemeral 127.0.0.1 ports at once, so they differ, prints
// them, and closes both. Run in a child process because Node has no
// synchronous listen, and the config must have its ports before it builds
// its URLs.
const PICK_TWO_FREE_PORTS = `
const net = require('node:net')
const listen = () => new Promise((resolve, reject) => {
  const server = net.createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => resolve(server))
})
Promise.all([listen(), listen()]).then((servers) => {
  process.stdout.write(servers.map((s) => s.address().port).join(' '))
  for (const s of servers) s.close()
})
`

if (!process.env.STEWARD_E2E_TOWER_PORT || !process.env.STEWARD_E2E_PORT) {
  const out = execFileSync(process.execPath, ['-e', PICK_TWO_FREE_PORTS], { encoding: 'utf8' })
  const [tower, steward] = out.trim().split(' ')
  if (!tower || !steward) {
    throw new Error(
      `steward e2e: could not pick two free loopback ports (got "${out}"); set STEWARD_E2E_TOWER_PORT and STEWARD_E2E_PORT`,
    )
  }
  process.env.STEWARD_E2E_TOWER_PORT ||= tower
  process.env.STEWARD_E2E_PORT ||= steward
}

const TOWER_PORT = Number(process.env.STEWARD_E2E_TOWER_PORT)
const STEWARD_PORT = Number(process.env.STEWARD_E2E_PORT)
const TOWER_URL = `http://127.0.0.1:${TOWER_PORT}`

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
  // Two real, separate processes: the fake tower backend, and the real
  // built steward server (adapter-node's build/index.js) pointed at it via
  // TOWER_URL, each on its port picked above. Playwright's own dependency
  // ordering starts them in array order and waits for each port before
  // moving on -- the fake backend must be up before steward's process,
  // since nothing here retries a failed startup fetch. Neither is ever
  // reused: a server already listening belongs to another run, possibly
  // another worktree's build, and a run must test its own.
  webServer: [
    {
      command: 'npx tsx tests/e2e/run-fake-backend.ts',
      port: TOWER_PORT,
      env: { STEWARD_E2E_TOWER_PORT: String(TOWER_PORT) },
      reuseExistingServer: false,
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
      reuseExistingServer: false,
      timeout: 15_000,
    },
  ],
})

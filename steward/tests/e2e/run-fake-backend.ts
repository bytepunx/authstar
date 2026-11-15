// Standalone process entry, started by Playwright's `webServer` array
// config (playwright.config.ts) alongside the real steward server -- gives
// e2e tests a real fake-tower HTTP server to talk to, on the port the
// config picked for this run and passes in STEWARD_E2E_TOWER_PORT.

import { startFakeBackend } from '../helpers/fake-backend-server.js'

const PORT = Number(process.env.STEWARD_E2E_TOWER_PORT)
const TOKEN = 'e2e-operator-token'

if (!Number.isInteger(PORT) || PORT <= 0) {
  throw new Error(
    `fake backend: STEWARD_E2E_TOWER_PORT is "${process.env.STEWARD_E2E_TOWER_PORT ?? ''}", not a port; run it through \`npm run test:e2e\`, whose playwright.config.ts picks one, or set it`,
  )
}

const backend = await startFakeBackend({ validToken: TOKEN }, PORT)
// eslint-disable-next-line no-console
console.log(`fake backend ready at ${backend.url}`)

process.on('SIGTERM', () => backend.close().then(() => process.exit(0)))
process.on('SIGINT', () => backend.close().then(() => process.exit(0)))

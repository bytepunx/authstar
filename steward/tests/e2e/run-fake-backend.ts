// Standalone process entry, started by Playwright's `webServer` array
// config (playwright.config.ts) alongside the real steward server -- gives
// e2e tests a real fake-tower HTTP server to talk to, on a fixed,
// known port.

import { startFakeBackend } from '../helpers/fake-backend-server.js'

const PORT = 4610
const TOKEN = 'e2e-operator-token'

const backend = await startFakeBackend({ validToken: TOKEN }, PORT)
// eslint-disable-next-line no-console
console.log(`fake backend ready at ${backend.url}`)

process.on('SIGTERM', () => backend.close().then(() => process.exit(0)))
process.on('SIGINT', () => backend.close().then(() => process.exit(0)))

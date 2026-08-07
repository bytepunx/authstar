// Shared between playwright.config.ts (webServer wiring) and the e2e specs
// themselves, so the two never drift apart.
export const FAKE_BACKEND_PORT = 5175
export const ADMIN_PORT = 4173
export const FAKE_BACKEND_URL = `http://127.0.0.1:${FAKE_BACKEND_PORT}`
export const ADMIN_URL = `http://127.0.0.1:${ADMIN_PORT}`

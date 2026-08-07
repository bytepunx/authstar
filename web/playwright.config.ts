import { defineConfig, devices } from '@playwright/test'
import { ADMIN_PORT, ADMIN_URL, FAKE_BACKEND_PORT, FAKE_BACKEND_URL } from './e2e/fixtures/urls'

// e2e tier (real browser, per TESTING.md): drives the actual built
// SvelteKit app (adapter-node's `build/index.js`, same artifact `npm run
// build` produces for real deployment) plus a second, plain-HTTP server
// that plays two roles at once -- (a) a fake tower backend, so `web`'s own
// server-side calls have something real to hit over the network, and (b) a
// static file host serving the built widget bundle + a plain HTML page
// that embeds it via script tag, for the widget-embed e2e test (Story 011:
// "verifying it actually renders and behaves outside the SvelteKit app
// shell"). Both are started via `webServer` so `playwright test` is a
// single command with no manual setup.
//
// Backend calls are still faked (no real tower/keep/Postgres) -- only the
// admin UI and the widget host page are "real browser" here, per this
// project's own tier definition.

export default defineConfig({
	testDir: './e2e',
	// Deliberately NOT parallel: every spec file drives the SAME fake
	// backend process (one in-memory Map, started once by `webServer`
	// below) and several specs reset/mutate shared tenant state
	// (`/__reset`, creating `acme`/`widgetco`). Parallel workers raced
	// against that shared state and produced real, intermittent failures
	// (a 404 issuing a usage credential because a concurrent test's
	// `/__reset` had just wiped the application out from under it) --
	// worth recording here since it's a genuine bug this pass found, not a
	// hypothetical. Fixing it by giving every worker its own backend
	// instance was judged not worth the added complexity for a 10-test
	// suite; serial execution is simpler and still fast enough.
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: [['list']],
	use: {
		baseURL: ADMIN_URL,
		trace: 'retain-on-failure',
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
	webServer: [
		{
			command: `npx tsx spec/fixtures/fake-tower-server.ts`,
			env: {
				PORT: String(FAKE_BACKEND_PORT),
				FAKE_TOWER_STATIC_DIR: 'e2e/fixtures/static',
				FAKE_TOWER_WIDGETS_DIR: 'dist-widgets',
			},
			url: FAKE_BACKEND_URL,
			reuseExistingServer: !process.env.CI,
		},
		{
			command: 'npm run build && npm run preview -- --port 4173',
			env: {
				TOWER_BASE_URL: FAKE_BACKEND_URL,
				PUBLIC_TOWER_BASE_URL: FAKE_BACKEND_URL,
				INTERNAL_JWT_JWKS_URL: `${FAKE_BACKEND_URL}/__jwks`,
				PORT: String(ADMIN_PORT),
			},
			url: ADMIN_URL,
			reuseExistingServer: !process.env.CI,
			timeout: 120_000,
		},
	],
})

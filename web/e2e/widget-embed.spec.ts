import { expect, test } from '@playwright/test'
import { FAKE_BACKEND_URL } from './fixtures/urls'

// Story 011's own required proof: a plain HTML page (e2e/fixtures/static/
// index.html, served by the fake backend, not `web`'s SvelteKit app at
// all) loading the built widget bundle via a single script tag and having
// it actually render and behave -- "verifying it actually renders and
// behaves outside the SvelteKit app shell." Absolute URL navigation
// (overriding the default admin-app baseURL) since this page deliberately
// lives on a different origin.

test.beforeEach(async ({ request }) => {
	await request.post(`${FAKE_BACKEND_URL}/__reset`)
})

test('<authstar-upgrade-button> renders and links to the hosted upgrade page, with host-set theming applied', async ({
	page,
}) => {
	await page.goto(FAKE_BACKEND_URL)

	const button = page.locator('authstar-upgrade-button')
	await expect(button).toBeVisible()

	const anchor = button.locator('a')
	await expect(anchor).toHaveText('Upgrade now')
	await expect(anchor).toHaveAttribute('href', '/_authstar/upgrade')

	// The host page (e2e/fixtures/static/index.html) sets
	// --authstar-color-primary and --authstar-border-radius -- confirms the
	// widget actually reads the host's custom properties through the shadow
	// boundary rather than hardcoding its own colors.
	const backgroundColor = await anchor.evaluate((el) => getComputedStyle(el).backgroundColor)
	expect(backgroundColor).toBe('rgb(124, 58, 237)') // #7c3aed
})

test('<authstar-subscription-status> fetches same-origin and renders a real subscription', async ({ page }) => {
	await page.goto(`${FAKE_BACKEND_URL}/?`)

	const widget = page.locator('authstar-subscription-status')
	const status = widget.locator('[data-testid="subscription-status"]')
	await expect(status).toContainText('Growth')
	await expect(status).toContainText('active')
})

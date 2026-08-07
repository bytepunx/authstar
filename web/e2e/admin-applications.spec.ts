import { expect, test } from '@playwright/test'
import { authenticateAs } from './fixtures/auth'
import { FAKE_BACKEND_URL } from './fixtures/urls'

// e2e tier: drives the real, built admin app through a realistic sequence
// (login -> overview -> manage an application), per this project's own
// TESTING.md tier definition. Backend calls are still faked (the fake
// tower server started by playwright.config.ts's `webServer`), but
// everything from the browser down through `web`'s real SvelteKit server
// code is exercised for real -- no route/data mocking inside the test
// itself the way spec/behavior does.

test.beforeEach(async ({ request }) => {
	await request.post(`${FAKE_BACKEND_URL}/__reset`)
})

test('an account with applications:manage can create, edit, and delete an application end to end', async ({
	page,
	context,
	request,
}) => {
	await authenticateAs(context, request, 'acme', { permissions: ['applications:manage'] })

	await page.goto('/')
	await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
	await expect(page.getByTestId('nav-applications')).toBeVisible()
	// Section gating (Story 001): no grant for billing was given, so it's
	// absent from the nav entirely, not merely disabled.
	await expect(page.getByTestId('nav-billing')).toHaveCount(0)

	await page.getByTestId('nav-applications').click();
	await expect(page.getByRole('heading', { name: 'Applications' })).toBeVisible()
	await expect(page.getByText('No applications yet.')).toBeVisible()

	await page.getByRole('link', { name: 'New application' }).click()
	await page.getByLabel('Slug').fill('widgetco')
	await page.getByLabel('Name').fill('Widget Co')
	await page.getByLabel('Hosts (comma-separated)').fill('widgetco.acme.example.com')
	await page.getByLabel('Primary host').fill('widgetco.acme.example.com')
	await page.getByLabel('Upstream base URL').fill('http://widgetco.internal:8080')
	await page.getByRole('button', { name: 'Create' }).click()

	// Create redirects straight to the detail page.
	await expect(page).toHaveURL(/\/applications\/widgetco$/)
	await expect(page.getByRole('heading', { name: 'Widget Co' })).toBeVisible()

	await page.getByTestId('nav-applications').click()
	await expect(page.getByTestId('application-row-widgetco')).toBeVisible()

	await page.getByRole('link', { name: 'widgetco' }).click()
	await page.getByLabel('Name').fill('Widget Co Renamed')
	await page.getByRole('button', { name: 'Save' }).click()
	await expect(page.getByRole('status')).toHaveText('Saved.')

	await page.getByRole('button', { name: 'Delete' }).click()
	await expect(page).toHaveURL(/\/applications$/)
	// Story 003: DELETE is a soft alias for PATCH { status: "deleted" }
	// server-side, not a removal from the list -- the row is still there,
	// just with its status changed (an earlier version of this test wrongly
	// assumed the list would go empty; the fake server's plain "return
	// everything in the store" list behavior caught that assumption).
	await expect(page.getByTestId('application-row-widgetco')).toContainText('deleted')
})

test('usage-reporting credentials can be issued (revealed once) and revoked', async ({ page, context, request }) => {
	await authenticateAs(context, request, 'acme', { permissions: ['applications:manage'] })

	await request.post(`${FAKE_BACKEND_URL}/tenants/acme/applications`, {
		data: {
			slug: 'widgetco',
			name: 'Widget Co',
			hosts: ['widgetco.acme.example.com'],
			primaryHost: 'widgetco.acme.example.com',
			upstream: { baseUrl: 'http://widgetco.internal:8080', prefixRoutes: [], timeout: 30 },
		},
	})

	await page.goto('/applications/widgetco')
	await page.getByRole('button', { name: 'Issue new credential' }).click()
	await expect(page.getByText("Save this secret now")).toBeVisible()
	const secretText = await page.locator('code').textContent()
	expect(secretText).toMatch(/^secret_/)

	await page.getByRole('button', { name: 'Revoke' }).click()
	await expect(page.getByText(/revoked/)).toBeVisible()
})

test('a section the account has no grant for is hidden from nav AND route-guarded directly', async ({
	page,
	context,
	request,
}) => {
	await authenticateAs(context, request, 'acme', { permissions: [] })

	await page.goto('/')
	await expect(page.getByTestId('nav-applications')).toHaveCount(0)

	// Story 001: "a direct URL visit to a section the account can't see ...
	// shows a clear 'you don't have access' state, never a silent 404."
	const response = await page.goto('/applications')
	expect(response?.status()).toBe(403)
})

test('an unauthenticated visit is rejected, not silently rendered', async ({ page }) => {
	const response = await page.goto('/')
	expect(response?.status()).toBe(401)
})

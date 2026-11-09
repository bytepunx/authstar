import { expect, test } from '@playwright/test'
import { authenticateAs, failTowerRoute } from './fixtures/auth'
import { FAKE_BACKEND_URL } from './fixtures/urls'

// e2e tier (S-0011): the nav, the root error page, and the handling of a
// failing tower, together in the real built app. An account holding every
// permission still sees only the sections that have a route; a route that
// does not exist and a tower 500 both land on web's own error page, never
// SvelteKit's default.

const EVERY_PERMISSION = [
	'applications:manage',
	'identity:manage',
	'contacts:read',
	'billing:read',
	'billing:manage',
	'communications:manage',
	'analytics:read',
	'privacy:manage',
	'settings:manage',
]

const UNBUILT_SECTIONS = ['identity', 'communications', 'analytics', 'privacy', 'settings']

test.beforeEach(async ({ context, request }) => {
	await request.post(`${FAKE_BACKEND_URL}/__reset`)
	await authenticateAs(context, request, 'acme', { permissions: EVERY_PERMISSION })
})

test('the nav lists only the sections that have a route', async ({ page }) => {
	await page.goto('/')
	await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()

	await expect(page.getByTestId('nav-overview')).toBeVisible()
	await expect(page.getByTestId('nav-applications')).toBeVisible()
	await expect(page.getByTestId('nav-billing')).toBeVisible()
	for (const id of UNBUILT_SECTIONS) {
		await expect(page.getByTestId(`nav-${id}`)).toHaveCount(0)
	}
})

test('a section with no route shows the error page, whose way back lands on the overview', async ({ page }) => {
	await page.goto('/identity')

	await expect(page.getByTestId('error-status')).toHaveText('Error 404')
	await expect(page.getByTestId('error-title')).toHaveText('Page not found')

	await page.getByTestId('error-home').click()
	await expect(page).toHaveURL(/\/$/)
	await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
})

test('a tower 500 on the applications list shows the error page for an unreachable service', async ({
	page,
	request,
}) => {
	await failTowerRoute(request, 'GET', '/tenants/acme/applications', 500)

	await page.goto('/applications')

	await expect(page.getByTestId('error-status')).toHaveText('Error 502')
	await expect(page.getByTestId('error-title')).toHaveText('Service unavailable')
	await expect(page.getByTestId('error-detail')).toContainText('did not respond')
	await expect(page.getByTestId('error-home')).toBeVisible()
	// The upstream's own body never reaches the page.
	await expect(page.getByText('fake tower failure')).toHaveCount(0)
})

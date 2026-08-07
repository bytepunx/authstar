import { expect, test } from '@playwright/test'
import { FAKE_BACKEND_URL } from './fixtures/urls'

// Story 010: the public signup page calls tower's `/tenants` DIRECTLY from
// the browser (the one place in the whole design with no portcullis
// mediation) -- so, unlike every other e2e spec here, this one deliberately
// does NOT fake the network call via page.route; it lets the real
// cross-origin browser fetch hit the fake backend, proving the CORS path
// actually works end to end, not just that the UI calls *something*.

test.beforeEach(async ({ request }) => {
	await request.post(`${FAKE_BACKEND_URL}/__reset`)
})

test('successful signup shows the check-your-email confirmation, no auto-login', async ({ page }) => {
	await page.goto('/signup')
	await page.getByLabel('Organization name').fill('Acme Corp')
	await page.getByLabel('Slug').fill('acme')
	await page.getByLabel('Admin email').fill('admin@acme.example.com')
	await page.getByRole('button', { name: 'Create account' }).click()

	await expect(page.getByText('Check your email to finish setting up your account.')).toBeVisible()
})

test('a provisioning failure tells the user to retry the SAME slug', async ({ page }) => {
	await page.goto('/signup')
	await page.getByLabel('Organization name').fill('Taken Co')
	await page.getByLabel('Slug').fill('taken')
	await page.getByLabel('Admin email').fill('admin@taken.example.com')
	await page.getByRole('button', { name: 'Create account' }).click()

	await expect(page.getByRole('alert')).toContainText('"taken"')
	await expect(page.getByRole('alert')).toContainText('safe to retry')
})

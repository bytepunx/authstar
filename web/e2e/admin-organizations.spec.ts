import { expect, test } from '@playwright/test'
import { authenticateAs } from './fixtures/auth'
import { FAKE_BACKEND_URL } from './fixtures/urls'

// e2e tier: drives the real, built admin app through ADR 0090's
// organizations screens (login -> list -> detail -> add/remove a manager,
// remove a member, send an invite). Same posture as
// admin-applications.spec.ts: the fake tower server is a real HTTP stand-in
// (spec/fixtures/fake-tower-server.ts), but everything from the browser
// down through `web`'s real SvelteKit server code runs for real.

test.beforeEach(async ({ request }) => {
	await request.post(`${FAKE_BACKEND_URL}/__reset`)
})

test('an account with billing:manage can view, co-manage, and invite within an organization end to end', async ({
	page,
	context,
	request,
}) => {
	await authenticateAs(context, request, 'acme', { permissions: ['billing:manage'] })

	await request.post(`${FAKE_BACKEND_URL}/tenants/acme/organizations`, {
		data: { organizationId: 'org-e2e', name: 'Acme Corp', managers: ['acct-1'] },
	})
	await request.post(`${FAKE_BACKEND_URL}/__seed/accounts`, {
		data: {
			tenant: 'acme',
			accounts: [
				{ accountId: 'acct-1', status: 'active', organizationId: 'org-e2e' },
				{ accountId: 'acct-2', status: 'active', organizationId: 'org-e2e' },
				{ accountId: 'acct-3', status: 'active', organizationId: 'org-e2e' },
			],
		},
	})

	await page.goto('/')
	await page.getByTestId('nav-billing').click()
	await page.getByRole('link', { name: 'Organizations' }).click()
	await expect(page.getByRole('heading', { name: 'Organizations' })).toBeVisible()
	await expect(page.getByTestId('organization-row-org-e2e')).toContainText('Acme Corp')

	await page.getByRole('link', { name: 'Acme Corp' }).click()
	await expect(page.getByRole('heading', { name: 'Acme Corp' })).toBeVisible()
	await expect(page.getByText('acct-1', { exact: true })).toBeVisible()

	// Promote acct-2 to co-manager.
	await page.getByPlaceholder('accountId').first().fill('acct-2')
	await page.getByRole('button', { name: 'Add manager' }).click()
	await expect(page.getByRole('status')).toHaveText('Saved.')
	const managersSection = page.locator('section', { has: page.getByRole('heading', { name: 'Managers' }) })
	await expect(managersSection.getByText('acct-2', { exact: true })).toBeVisible()

	// Demote acct-2 back off the managers list.
	await managersSection.locator('li', { hasText: 'acct-2' }).getByRole('button', { name: 'Remove' }).click()
	await expect(page.getByRole('status')).toHaveText('Saved.')
	await expect(managersSection.getByText('acct-2', { exact: true })).toHaveCount(0)

	// Remove acct-3 as a plain member entirely.
	const membersSection = page.locator('section', { has: page.getByRole('heading', { name: 'Members' }) })
	await expect(membersSection.getByText('acct-3', { exact: true })).toBeVisible()
	await membersSection.locator('li', { hasText: 'acct-3' }).getByRole('button', { name: 'Remove' }).click()
	await expect(page.getByRole('status')).toHaveText('Saved.')
	await expect(membersSection.getByText('acct-3', { exact: true })).toHaveCount(0)

	// Send an invite for a new manager.
	await page.getByLabel('Contact id').fill('new-admin@acme.example.com')
	await page.getByRole('radio', { name: 'Co-manager' }).check()
	await page.getByRole('button', { name: 'Send invite' }).click()
	await expect(page.getByRole('status')).toHaveText('Invite sent.')
})

test('the organizations screen is reachable via organization:manage alone, with no billing grant at all', async ({
	page,
	context,
	request,
}) => {
	await authenticateAs(context, request, 'acme', { permissions: ['organization:manage'] })
	await request.post(`${FAKE_BACKEND_URL}/tenants/acme/organizations`, {
		data: { organizationId: 'org-e2e', name: 'Acme Corp', managers: ['acct-1'] },
	})

	await page.goto('/billing/organizations')
	await expect(page.getByRole('heading', { name: 'Organizations' })).toBeVisible()
	await expect(page.getByTestId('organization-row-org-e2e')).toContainText('Acme Corp')
})

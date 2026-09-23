import { expect, test } from '@playwright/test'
import { authenticateAs } from './fixtures/auth'
import { FAKE_BACKEND_URL } from './fixtures/urls'

// e2e tier: drives the real, built admin app through ADR 0100's
// organizations screens (login -> list -> detail -> grant/revoke a role,
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
		data: { organizationId: 'org-e2e', name: 'Acme Corp' },
	})
	await request.post(`${FAKE_BACKEND_URL}/__seed/memberships`, {
		data: {
			tenant: 'acme',
			memberships: [
				{ membershipId: 'm-1', accountId: 'acct-1', organizationId: 'org-e2e', roles: ['manager', 'member'] },
				{ membershipId: 'm-2', accountId: 'acct-2', organizationId: 'org-e2e', roles: ['member'] },
				{ membershipId: 'm-3', accountId: 'acct-3', organizationId: 'org-e2e', roles: ['member'] },
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
	const membersSection = page.locator('section', { has: page.getByRole('heading', { name: 'Members' }) })
	const acct2Row = membersSection.locator('li', { hasText: 'acct-2' })
	const acct3Row = membersSection.locator('li', { hasText: 'acct-3' })
	await expect(acct2Row).toBeVisible()

	// Promote acct-2 to co-manager.
	await acct2Row.getByRole('button', { name: '+manager' }).click()
	await expect(page.getByRole('status')).toHaveText('Saved.')
	await expect(acct2Row.getByText('manager', { exact: true })).toBeVisible()

	// Demote acct-2 back off manager standing.
	await acct2Row.getByRole('button', { name: '-manager' }).click()
	await expect(page.getByRole('status')).toHaveText('Saved.')
	await expect(acct2Row.getByText('manager', { exact: true })).toHaveCount(0)

	// Remove acct-3 as a plain member entirely.
	await acct3Row.getByRole('button', { name: 'Remove' }).click()
	await expect(page.getByRole('status')).toHaveText('Saved.')
	await expect(membersSection.getByText('acct-3', { exact: true })).toHaveCount(0)

	// Send an invite for a new manager.
	await page.getByLabel('Contact id').fill('new-admin@acme.example.com')
	await page.getByRole('radio', { name: 'manager', exact: true }).check()
	await page.getByRole('button', { name: 'Send invite' }).click()
	await expect(page.getByRole('status')).toHaveText('Invite sent.')
})

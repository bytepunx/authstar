import { expect, test } from '@playwright/test'
import { authenticateAs } from './fixtures/auth'
import { FAKE_BACKEND_URL } from './fixtures/urls'

// e2e tier: drives the real, built app through the embeddable (embed)/
// organizations surface (ADR 0100/0099) -- the customer-facing counterpart
// to admin-organizations.spec.ts, gated on organizationMemberships rather
// than a tenant-staff permissions grant. Navigating directly to the route
// (rather than via an actual host-page <iframe>) is enough to prove the
// page itself works -- the iframe embedding is a browser-level detail this
// app's own server code has no visibility into either way.

test.beforeEach(async ({ request }) => {
	await request.post(`${FAKE_BACKEND_URL}/__reset`)
})

test('a manager can view the roster, grant a role, and invite a new member', async ({ page, context, request }) => {
	await authenticateAs(context, request, 'acme', {
		accountId: 'acct-1',
		permissions: [],
		organizationMemberships: [{ organizationId: 'org-e2e', roles: ['manager', 'member'] }],
	})

	await request.post(`${FAKE_BACKEND_URL}/tenants/acme/organizations`, {
		data: { organizationId: 'org-e2e', name: 'Acme Corp' },
	})
	await request.post(`${FAKE_BACKEND_URL}/__seed/memberships`, {
		data: {
			tenant: 'acme',
			memberships: [
				{ membershipId: 'm-1', accountId: 'acct-1', organizationId: 'org-e2e', roles: ['manager', 'member'] },
				{ membershipId: 'm-2', accountId: 'acct-2', organizationId: 'org-e2e', roles: ['member'] },
			],
		},
	})

	await page.goto('/organizations/org-e2e?primaryColor=%23336699&fontFamily=Inter')
	await expect(page.getByRole('heading', { name: 'Acme Corp' })).toBeVisible()

	const acct2Row = page.locator('li', { hasText: 'acct-2' })
	await acct2Row.getByRole('button', { name: '+billingViewer' }).click()
	await expect(page.getByRole('status')).toHaveText('Saved.')
	await expect(acct2Row.getByText('billingViewer', { exact: true })).toBeVisible()

	await page.getByLabel('Email').fill('new-member@acme.example.com')
	await page.getByRole('radio', { name: 'member', exact: true }).check()
	await page.getByRole('button', { name: 'Send invite' }).click()
	await expect(page.getByRole('status')).toHaveText('Invite sent.')
})

test('a plain member cannot see manager-only controls and can leave voluntarily', async ({ page, context, request }) => {
	await authenticateAs(context, request, 'acme', {
		accountId: 'acct-2',
		permissions: [],
		organizationMemberships: [{ organizationId: 'org-e2e', roles: ['member'] }],
	})

	await request.post(`${FAKE_BACKEND_URL}/tenants/acme/organizations`, {
		data: { organizationId: 'org-e2e', name: 'Acme Corp' },
	})
	await request.post(`${FAKE_BACKEND_URL}/__seed/memberships`, {
		data: {
			tenant: 'acme',
			memberships: [
				{ membershipId: 'm-1', accountId: 'acct-1', organizationId: 'org-e2e', roles: ['manager', 'member'] },
				{ membershipId: 'm-2', accountId: 'acct-2', organizationId: 'org-e2e', roles: ['member'] },
			],
		},
	})

	await page.goto('/organizations/org-e2e')
	await expect(page.getByRole('heading', { name: 'Acme Corp' })).toBeVisible()
	await expect(page.getByRole('button', { name: 'Send invite' })).toHaveCount(0)

	const selfRow = page.locator('li', { hasText: 'acct-2' })
	await selfRow.getByRole('button', { name: 'Leave' }).click()
	await expect(page.getByRole('status')).toHaveText("You've left this organization.")
})

test('a caller with no membership in this organization is rejected with a 403', async ({ page, context, request }) => {
	await authenticateAs(context, request, 'acme', {
		accountId: 'acct-9',
		permissions: [],
		organizationMemberships: [{ organizationId: 'org-other', roles: ['member'] }],
	})
	await request.post(`${FAKE_BACKEND_URL}/tenants/acme/organizations`, {
		data: { organizationId: 'org-e2e', name: 'Acme Corp' },
	})

	const response = await page.goto('/organizations/org-e2e')
	expect(response?.status()).toBe(403)
})

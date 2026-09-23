import { describe, expect, it } from 'vitest'
import { isHttpError } from '@sveltejs/kit'
import { load as loadLayout } from '../../src/routes/(embed)/organizations/[organizationId]/+layout.server'
import { actions, load } from '../../src/routes/(embed)/organizations/[organizationId]/+page.server'
import { createFakeTowerClient, fakeMembership, fakeOrganization } from '../fixtures/fake-tower-client'
import { fakeSession } from '../fixtures/fake-session'

// Behavior tier: the embeddable, customer-facing (embed)/organizations
// surface (ADR 0100/0099) -- gated on the caller's own
// session.organizationMemberships, never the tenant-staff permissions grant
// the (admin) surface checks.

function formRequest(fields: Record<string, string>): Request {
	const form = new FormData()
	for (const [key, value] of Object.entries(fields)) form.append(key, value)
	return new Request('http://web.internal/organizations/org-1', { method: 'POST', body: form })
}

describe('(embed)/organizations/[organizationId] layout load', () => {
	it('allows a member through and reports whether they are a manager', async () => {
		const session = fakeSession({ organizationMemberships: [{ organizationId: 'org-1', roles: ['manager', 'member'] }] })
		const result = await loadLayout({
			locals: { session },
			params: { organizationId: 'org-1' },
			url: new URL('http://web.internal/organizations/org-1'),
		} as Parameters<typeof loadLayout>[0])

		expect(result.isManager).toBe(true)
	})

	it('reports isManager=false for a plain member', async () => {
		const session = fakeSession({ organizationMemberships: [{ organizationId: 'org-1', roles: ['member'] }] })
		const result = await loadLayout({
			locals: { session },
			params: { organizationId: 'org-1' },
			url: new URL('http://web.internal/organizations/org-1'),
		} as Parameters<typeof loadLayout>[0])

		expect(result.isManager).toBe(false)
	})

	it('403s a caller who does not belong to this organization at all', async () => {
		const session = fakeSession({ organizationMemberships: [{ organizationId: 'org-2', roles: ['manager', 'member'] }] })
		try {
			await loadLayout({
				locals: { session },
				params: { organizationId: 'org-1' },
				url: new URL('http://web.internal/organizations/org-1'),
			} as Parameters<typeof loadLayout>[0])
			expect.unreachable('expected a 403')
		} catch (err) {
			expect(isHttpError(err)).toBe(true)
			if (isHttpError(err)) expect(err.status).toBe(403)
		}
	})

	it('401s when there is no session at all', async () => {
		try {
			await loadLayout({
				locals: { session: null },
				params: { organizationId: 'org-1' },
				url: new URL('http://web.internal/organizations/org-1'),
			} as Parameters<typeof loadLayout>[0])
			expect.unreachable('expected a 401')
		} catch (err) {
			expect(isHttpError(err)).toBe(true)
			if (isHttpError(err)) expect(err.status).toBe(401)
		}
	})

	it('only accepts a theme param matching the validation pattern, silently dropping anything else', async () => {
		const session = fakeSession({ organizationMemberships: [{ organizationId: 'org-1', roles: ['member'] }] })
		const valid = await loadLayout({
			locals: { session },
			params: { organizationId: 'org-1' },
			url: new URL('http://web.internal/organizations/org-1?primaryColor=%23336699&fontFamily=Inter'),
		} as Parameters<typeof loadLayout>[0])
		expect(valid.theme).toEqual({ primaryColor: '#336699', fontFamily: 'Inter' })

		const invalid = await loadLayout({
			locals: { session },
			params: { organizationId: 'org-1' },
			url: new URL('http://web.internal/organizations/org-1?primaryColor=' + encodeURIComponent('red; } body { display:none')),
		} as Parameters<typeof loadLayout>[0])
		expect(invalid.theme.primaryColor).toBeUndefined()
	})
})

describe('(embed)/organizations/[organizationId] page load', () => {
	it('returns the organization, its members, and the role catalog', async () => {
		const tower = createFakeTowerClient({
			organizations: [fakeOrganization({ organizationId: 'org-1' })],
			memberships: [fakeMembership({ organizationId: 'org-1', accountId: 'acct-1', roles: ['manager', 'member'] })],
		})
		const session = fakeSession({ accountId: 'acct-1', organizationMemberships: [{ organizationId: 'org-1', roles: ['manager', 'member'] }] })
		const result = await load({
			locals: { session, clients: { tower } },
			params: { organizationId: 'org-1' },
			parent: async () => ({ session, theme: {}, isManager: true }),
		} as Parameters<typeof load>[0])

		expect(result.organization.organizationId).toBe('org-1')
		expect(result.members.map((m) => m.accountId)).toEqual(['acct-1'])
		expect(result.roleCatalog.length).toBeGreaterThan(0)
	})
})

describe('(embed)/organizations/[organizationId] actions', () => {
	const session = fakeSession({ accountId: 'acct-1', organizationMemberships: [{ organizationId: 'org-1', roles: ['manager', 'member'] }] })

	it('grantRole forwards to tower', async () => {
		const tower = createFakeTowerClient({
			organizations: [fakeOrganization({ organizationId: 'org-1' })],
			memberships: [fakeMembership({ organizationId: 'org-1', accountId: 'acct-2', roles: ['member'] })],
		})
		const result = await actions.grantRole({
			request: formRequest({ accountId: 'acct-2', role: 'billingViewer' }),
			locals: { session, clients: { tower } },
			params: { organizationId: 'org-1' },
		} as Parameters<typeof actions.grantRole>[0])

		expect(result?.success).toBe(true)
		expect(tower.grantOrganizationRole).toHaveBeenCalledWith('acme', 'org-1', 'acct-2', 'billingViewer')
	})

	it('removeMember reports left=true when the caller removes themselves', async () => {
		const tower = createFakeTowerClient({
			organizations: [fakeOrganization({ organizationId: 'org-1' })],
			memberships: [fakeMembership({ organizationId: 'org-1', accountId: 'acct-1', roles: ['member'] })],
		})
		const result = await actions.removeMember({
			request: formRequest({ accountId: 'acct-1' }),
			locals: { session, clients: { tower } },
			params: { organizationId: 'org-1' },
		} as Parameters<typeof actions.removeMember>[0])

		expect(result?.success).toBe(true)
		expect((result as { left: boolean })?.left).toBe(true)
	})

	it('setSuccessor/clearSuccessor always target the caller\'s own accountId, never a form-supplied one', async () => {
		const tower = createFakeTowerClient({
			organizations: [fakeOrganization({ organizationId: 'org-1' })],
			memberships: [
				fakeMembership({ membershipId: 'm-1', organizationId: 'org-1', accountId: 'acct-1', roles: ['manager', 'member'] }),
				fakeMembership({ membershipId: 'm-2', organizationId: 'org-1', accountId: 'acct-2', roles: ['member'] }),
			],
		})
		await actions.setSuccessor({
			request: formRequest({ successorAccountId: 'acct-2' }),
			locals: { session, clients: { tower } },
			params: { organizationId: 'org-1' },
		} as Parameters<typeof actions.setSuccessor>[0])
		expect(tower.setOrganizationSuccessor).toHaveBeenCalledWith('acme', 'org-1', 'acct-1', 'acct-2')

		await actions.clearSuccessor({
			locals: { session, clients: { tower } },
			params: { organizationId: 'org-1' },
		} as Parameters<typeof actions.clearSuccessor>[0])
		expect(tower.clearOrganizationSuccessor).toHaveBeenCalledWith('acme', 'org-1', 'acct-1')
	})

	it('invite sends an email-based invite for any org-scope role', async () => {
		const tower = createFakeTowerClient({ organizations: [fakeOrganization({ organizationId: 'org-1' })] })
		const result = await actions.invite({
			request: formRequest({ email: 'new@example.com', organizationRole: 'billingAdmin' }),
			locals: { session, clients: { tower } },
			params: { organizationId: 'org-1' },
		} as Parameters<typeof actions.invite>[0])

		expect(result?.invited).toBe(true)
		expect(tower.createOrganizationInvite).toHaveBeenCalledWith('acme', 'org-1', { email: 'new@example.com', organizationRole: 'billingAdmin' })
	})

	it('403s any action for a caller who is not a member of this organization', async () => {
		const tower = createFakeTowerClient({ organizations: [fakeOrganization({ organizationId: 'org-1' })] })
		const outsider = fakeSession({ accountId: 'acct-9', organizationMemberships: [{ organizationId: 'org-2', roles: ['member'] }] })
		try {
			await actions.grantRole({
				request: formRequest({ accountId: 'acct-1', role: 'manager' }),
				locals: { session: outsider, clients: { tower } },
				params: { organizationId: 'org-1' },
			} as Parameters<typeof actions.grantRole>[0])
			expect.unreachable('expected a 403')
		} catch (err) {
			expect(isHttpError(err)).toBe(true)
			if (isHttpError(err)) expect(err.status).toBe(403)
		}
	})
})

import { describe, expect, it } from 'vitest'
import { isHttpError } from '@sveltejs/kit'
import { actions, load } from '../../src/routes/(admin)/billing/organizations/[organizationId]/+page.server'
import { createFakeTowerClient, fakeMembership, fakeOrganization } from '../fixtures/fake-tower-client'
import { fakeSession } from '../fixtures/fake-session'

function formRequest(fields: Record<string, string>): Request {
	const form = new FormData()
	for (const [key, value] of Object.entries(fields)) form.append(key, value)
	return new Request('http://web.internal/billing/organizations/org-1', { method: 'POST', body: form })
}

describe('organizations/[organizationId] load -- ADR 0100', () => {
	it('returns the organization, its members, and the org-scope role catalog', async () => {
		const tower = createFakeTowerClient({
			organizations: [fakeOrganization({ organizationId: 'org-1' })],
			memberships: [
				fakeMembership({ membershipId: 'm-1', organizationId: 'org-1', accountId: 'acct-1', roles: ['manager', 'member'] }),
				fakeMembership({ membershipId: 'm-2', organizationId: 'org-1', accountId: 'acct-2', roles: ['member'] }),
			],
		})
		const result = await load({
			locals: { session: fakeSession({ permissions: ['billing:manage'] }), clients: { tower } },
			params: { organizationId: 'org-1' },
		} as Parameters<typeof load>[0])

		expect(result.organization.organizationId).toBe('org-1')
		expect(result.members.map((m) => m.accountId).sort()).toEqual(['acct-1', 'acct-2'])
		expect(result.roleCatalog.map((r) => r.name).sort()).toEqual(['billingAdmin', 'billingViewer', 'manager', 'member'])
	})

	it('404s for an organization that does not exist', async () => {
		const tower = createFakeTowerClient()
		try {
			await load({
				locals: { session: fakeSession({ permissions: ['billing:manage'] }), clients: { tower } },
				params: { organizationId: 'nonexistent' },
			} as Parameters<typeof load>[0])
			expect.unreachable('expected a 404')
		} catch (err) {
			expect(isHttpError(err)).toBe(true)
			if (isHttpError(err)) expect(err.status).toBe(404)
		}
	})
})

describe('organizations/[organizationId] grantRole action', () => {
	it('promotes an existing member to co-manager', async () => {
		const tower = createFakeTowerClient({
			organizations: [fakeOrganization({ organizationId: 'org-1' })],
			memberships: [fakeMembership({ organizationId: 'org-1', accountId: 'acct-2', roles: ['member'] })],
		})
		const result = await actions.grantRole({
			request: formRequest({ accountId: 'acct-2', role: 'manager' }),
			locals: { session: fakeSession({ permissions: ['billing:manage'] }), clients: { tower } },
			params: { organizationId: 'org-1' },
		} as Parameters<typeof actions.grantRole>[0])

		expect(result?.success).toBe(true)
		expect(tower.grantOrganizationRole).toHaveBeenCalledWith('acme', 'org-1', 'acct-2', 'manager')
	})

	it('grants the narrower billingAdmin role too -- same generic action, no separate mechanism', async () => {
		const tower = createFakeTowerClient({
			organizations: [fakeOrganization({ organizationId: 'org-1' })],
			memberships: [fakeMembership({ organizationId: 'org-1', accountId: 'acct-2', roles: ['member'] })],
		})
		const result = await actions.grantRole({
			request: formRequest({ accountId: 'acct-2', role: 'billingAdmin' }),
			locals: { session: fakeSession({ permissions: ['billing:manage'] }), clients: { tower } },
			params: { organizationId: 'org-1' },
		} as Parameters<typeof actions.grantRole>[0])

		expect(result?.success).toBe(true)
		expect(tower.grantOrganizationRole).toHaveBeenCalledWith('acme', 'org-1', 'acct-2', 'billingAdmin')
	})

	it('400s with no accountId or role, never calling tower', async () => {
		const tower = createFakeTowerClient({ organizations: [fakeOrganization()] })
		const result = await actions.grantRole({
			request: formRequest({}),
			locals: { session: fakeSession({ permissions: ['billing:manage'] }), clients: { tower } },
			params: { organizationId: 'org-1' },
		} as Parameters<typeof actions.grantRole>[0])
		expect(result?.status).toBe(400)
		expect(tower.grantOrganizationRole).not.toHaveBeenCalled()
	})

	it('surfaces a tower rejection as a form error', async () => {
		const tower = createFakeTowerClient({ organizations: [fakeOrganization()], rejectMutations: true })
		const result = await actions.grantRole({
			request: formRequest({ accountId: 'acct-2', role: 'manager' }),
			locals: { session: fakeSession({ permissions: ['billing:manage'] }), clients: { tower } },
			params: { organizationId: 'org-1' },
		} as Parameters<typeof actions.grantRole>[0])
		expect(result?.status).toBe(409)
	})
})

describe('organizations/[organizationId] revokeRole action', () => {
	it('demotes a co-manager back to plain member', async () => {
		const tower = createFakeTowerClient({
			organizations: [fakeOrganization({ organizationId: 'org-1' })],
			memberships: [fakeMembership({ organizationId: 'org-1', accountId: 'acct-2', roles: ['manager', 'member'] })],
		})
		const result = await actions.revokeRole({
			request: formRequest({ accountId: 'acct-2', role: 'manager' }),
			locals: { session: fakeSession({ permissions: ['billing:manage'] }), clients: { tower } },
			params: { organizationId: 'org-1' },
		} as Parameters<typeof actions.revokeRole>[0])

		expect(result?.success).toBe(true)
		expect(tower.revokeOrganizationRole).toHaveBeenCalledWith('acme', 'org-1', 'acct-2', 'manager')
	})

	it('revokes billingViewer from a member', async () => {
		const tower = createFakeTowerClient({
			organizations: [fakeOrganization({ organizationId: 'org-1' })],
			memberships: [fakeMembership({ organizationId: 'org-1', accountId: 'acct-2', roles: ['member', 'billingViewer'] })],
		})
		const result = await actions.revokeRole({
			request: formRequest({ accountId: 'acct-2', role: 'billingViewer' }),
			locals: { session: fakeSession({ permissions: ['billing:manage'] }), clients: { tower } },
			params: { organizationId: 'org-1' },
		} as Parameters<typeof actions.revokeRole>[0])

		expect(result?.success).toBe(true)
		expect(tower.revokeOrganizationRole).toHaveBeenCalledWith('acme', 'org-1', 'acct-2', 'billingViewer')
	})

	it('surfaces the last-manager-with-no-successor rejection', async () => {
		const tower = createFakeTowerClient({ organizations: [fakeOrganization()], rejectMutations: true })
		const result = await actions.revokeRole({
			request: formRequest({ accountId: 'acct-1', role: 'manager' }),
			locals: { session: fakeSession({ permissions: ['billing:manage'] }), clients: { tower } },
			params: { organizationId: 'org-1' },
		} as Parameters<typeof actions.revokeRole>[0])
		expect(result?.status).toBe(409)
	})
})

describe('organizations/[organizationId] removeMember action', () => {
	it('removes a plain member', async () => {
		const tower = createFakeTowerClient({
			organizations: [fakeOrganization({ organizationId: 'org-1' })],
			memberships: [fakeMembership({ organizationId: 'org-1', accountId: 'acct-2', roles: ['member'] })],
		})
		const result = await actions.removeMember({
			request: formRequest({ accountId: 'acct-2' }),
			locals: { session: fakeSession({ permissions: ['billing:manage'] }), clients: { tower } },
			params: { organizationId: 'org-1' },
		} as Parameters<typeof actions.removeMember>[0])

		expect(result?.success).toBe(true)
		expect(tower.removeOrganizationMember).toHaveBeenCalledWith('acme', 'org-1', 'acct-2')
	})
})

describe('organizations/[organizationId] invite action', () => {
	it('sends an invite for any org-scope role, not just member/manager', async () => {
		const tower = createFakeTowerClient({ organizations: [fakeOrganization({ organizationId: 'org-1' })] })
		const result = await actions.invite({
			request: formRequest({ contactId: 'contact-1', organizationRole: 'billingViewer' }),
			locals: { session: fakeSession({ permissions: ['billing:manage'] }), clients: { tower } },
			params: { organizationId: 'org-1' },
		} as Parameters<typeof actions.invite>[0])

		expect(result?.invited).toBe(true)
		expect(tower.createOrganizationInvite).toHaveBeenCalledWith('acme', 'org-1', { contactId: 'contact-1', organizationRole: 'billingViewer' })
	})

	it('400s with no contactId, never calling tower', async () => {
		const tower = createFakeTowerClient({ organizations: [fakeOrganization()] })
		const result = await actions.invite({
			request: formRequest({ organizationRole: 'member' }),
			locals: { session: fakeSession({ permissions: ['billing:manage'] }), clients: { tower } },
			params: { organizationId: 'org-1' },
		} as Parameters<typeof actions.invite>[0])
		expect(result?.status).toBe(400)
		expect(tower.createOrganizationInvite).not.toHaveBeenCalled()
	})
})

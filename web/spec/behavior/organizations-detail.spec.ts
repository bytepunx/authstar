import { describe, expect, it } from 'vitest'
import { isHttpError } from '@sveltejs/kit'
import { actions, load } from '../../src/routes/(admin)/billing/organizations/[organizationId]/+page.server'
import { createFakeTowerClient, fakeOrganization } from '../fixtures/fake-tower-client'
import { fakeSession } from '../fixtures/fake-session'
import type { AccountSummary } from '../../src/lib/server/clients/tower'

function formRequest(fields: Record<string, string>): Request {
	const form = new FormData()
	for (const [key, value] of Object.entries(fields)) form.append(key, value)
	return new Request('http://web.internal/billing/organizations/org-1', { method: 'POST', body: form })
}

function account(overrides: Partial<AccountSummary> = {}): AccountSummary {
	return { accountId: 'acct-2', status: 'active', organizationId: 'org-1', ...overrides }
}

describe('organizations/[organizationId] load -- ADR 0090', () => {
	it('returns the organization and its members', async () => {
		const tower = createFakeTowerClient({
			organizations: [fakeOrganization({ organizationId: 'org-1', managers: ['acct-1'] })],
			accounts: [account({ accountId: 'acct-1' }), account({ accountId: 'acct-2' })],
		})
		const result = await load({
			locals: { session: fakeSession({ permissions: ['billing:manage'] }), clients: { tower } },
			params: { organizationId: 'org-1' },
		} as Parameters<typeof load>[0])

		expect(result.organization.organizationId).toBe('org-1')
		expect(result.members.map((m) => m.accountId).sort()).toEqual(['acct-1', 'acct-2'])
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

describe('organizations/[organizationId] addManager action', () => {
	it('promotes an existing member to co-manager', async () => {
		const tower = createFakeTowerClient({ organizations: [fakeOrganization({ organizationId: 'org-1', managers: ['acct-1'] })] })
		const result = await actions.addManager({
			request: formRequest({ accountId: 'acct-2' }),
			locals: { session: fakeSession({ permissions: ['billing:manage'] }), clients: { tower } },
			params: { organizationId: 'org-1' },
		} as Parameters<typeof actions.addManager>[0])

		expect(result?.success).toBe(true)
		expect(tower.addOrganizationManager).toHaveBeenCalledWith('acme', 'org-1', 'acct-2')
	})

	it('400s with no accountId, never calling tower', async () => {
		const tower = createFakeTowerClient({ organizations: [fakeOrganization()] })
		const result = await actions.addManager({
			request: formRequest({}),
			locals: { session: fakeSession({ permissions: ['billing:manage'] }), clients: { tower } },
			params: { organizationId: 'org-1' },
		} as Parameters<typeof actions.addManager>[0])
		expect(result?.status).toBe(400)
		expect(tower.addOrganizationManager).not.toHaveBeenCalled()
	})

	it('surfaces a tower rejection as a form error', async () => {
		const tower = createFakeTowerClient({ organizations: [fakeOrganization()], rejectMutations: true })
		const result = await actions.addManager({
			request: formRequest({ accountId: 'acct-2' }),
			locals: { session: fakeSession({ permissions: ['billing:manage'] }), clients: { tower } },
			params: { organizationId: 'org-1' },
		} as Parameters<typeof actions.addManager>[0])
		expect(result?.status).toBe(409)
	})
})

describe('organizations/[organizationId] removeManager action', () => {
	it('removes a co-manager', async () => {
		const tower = createFakeTowerClient({ organizations: [fakeOrganization({ organizationId: 'org-1', managers: ['acct-1', 'acct-2'] })] })
		const result = await actions.removeManager({
			request: formRequest({ accountId: 'acct-2' }),
			locals: { session: fakeSession({ permissions: ['billing:manage'] }), clients: { tower } },
			params: { organizationId: 'org-1' },
		} as Parameters<typeof actions.removeManager>[0])

		expect(result?.success).toBe(true)
		expect(tower.removeOrganizationManager).toHaveBeenCalledWith('acme', 'org-1', 'acct-2')
	})
})

describe('organizations/[organizationId] grantBillingAccess action (ADR 0098)', () => {
	it('grants organization-billing:manage to a member', async () => {
		const tower = createFakeTowerClient({
			organizations: [fakeOrganization({ organizationId: 'org-1', managers: ['acct-1'] })],
			accounts: [account({ accountId: 'acct-2' })],
		})
		const result = await actions.grantBillingAccess({
			request: formRequest({ accountId: 'acct-2' }),
			locals: { session: fakeSession({ permissions: ['billing:manage'] }), clients: { tower } },
			params: { organizationId: 'org-1' },
		} as Parameters<typeof actions.grantBillingAccess>[0])

		expect(result?.success).toBe(true)
		expect(tower.grantBillingAccess).toHaveBeenCalledWith('acme', 'org-1', 'acct-2')
	})

	it('400s with no accountId, never calling tower', async () => {
		const tower = createFakeTowerClient({ organizations: [fakeOrganization()] })
		const result = await actions.grantBillingAccess({
			request: formRequest({}),
			locals: { session: fakeSession({ permissions: ['billing:manage'] }), clients: { tower } },
			params: { organizationId: 'org-1' },
		} as Parameters<typeof actions.grantBillingAccess>[0])
		expect(result?.status).toBe(400)
		expect(tower.grantBillingAccess).not.toHaveBeenCalled()
	})

	it('surfaces a tower rejection as a form error', async () => {
		const tower = createFakeTowerClient({ organizations: [fakeOrganization()], rejectMutations: true })
		const result = await actions.grantBillingAccess({
			request: formRequest({ accountId: 'acct-2' }),
			locals: { session: fakeSession({ permissions: ['billing:manage'] }), clients: { tower } },
			params: { organizationId: 'org-1' },
		} as Parameters<typeof actions.grantBillingAccess>[0])
		expect(result?.status).toBe(409)
	})
})

describe('organizations/[organizationId] revokeBillingAccess action (ADR 0098)', () => {
	it('revokes organization-billing:manage from a member', async () => {
		const tower = createFakeTowerClient({
			organizations: [fakeOrganization({ organizationId: 'org-1', managers: ['acct-1'] })],
			accounts: [account({ accountId: 'acct-2' })],
		})
		const result = await actions.revokeBillingAccess({
			request: formRequest({ accountId: 'acct-2' }),
			locals: { session: fakeSession({ permissions: ['billing:manage'] }), clients: { tower } },
			params: { organizationId: 'org-1' },
		} as Parameters<typeof actions.revokeBillingAccess>[0])

		expect(result?.success).toBe(true)
		expect(tower.revokeBillingAccess).toHaveBeenCalledWith('acme', 'org-1', 'acct-2')
	})
})

describe('organizations/[organizationId] removeMember action', () => {
	it('removes a plain member', async () => {
		const tower = createFakeTowerClient({
			organizations: [fakeOrganization({ organizationId: 'org-1', managers: ['acct-1'] })],
			accounts: [account({ accountId: 'acct-2' })],
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
	it('sends a member-role invite by default', async () => {
		const tower = createFakeTowerClient({ organizations: [fakeOrganization({ organizationId: 'org-1' })] })
		const result = await actions.invite({
			request: formRequest({ contactId: 'contact-1', organizationRole: 'member' }),
			locals: { session: fakeSession({ permissions: ['billing:manage'] }), clients: { tower } },
			params: { organizationId: 'org-1' },
		} as Parameters<typeof actions.invite>[0])

		expect(result?.invited).toBe(true)
		expect(tower.createOrganizationInvite).toHaveBeenCalledWith('acme', 'org-1', { contactId: 'contact-1', organizationRole: 'member' })
	})

	it('sends a manager-role invite when selected', async () => {
		const tower = createFakeTowerClient({ organizations: [fakeOrganization({ organizationId: 'org-1' })] })
		await actions.invite({
			request: formRequest({ contactId: 'contact-1', organizationRole: 'manager' }),
			locals: { session: fakeSession({ permissions: ['billing:manage'] }), clients: { tower } },
			params: { organizationId: 'org-1' },
		} as Parameters<typeof actions.invite>[0])

		expect(tower.createOrganizationInvite).toHaveBeenCalledWith('acme', 'org-1', { contactId: 'contact-1', organizationRole: 'manager' })
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

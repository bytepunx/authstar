import { describe, expect, it } from 'vitest'
import { isHttpError } from '@sveltejs/kit'
import { actions, load } from '../../src/routes/(embed)/organizations/[organizationId]/applications/[applicationSlug]/api-keys/+page.server'
import { createFakeTowerClient, fakeApiKey, fakeOrganization } from '../fixtures/fake-tower-client'
import { fakeSession } from '../fixtures/fake-session'

// Behavior tier: design/decisions/0101-api-keys.md's org-scoped keys embed
// surface -- reuses the *existing* org embed layout/membership gate via
// ordinary SvelteKit route nesting (no new layout file), so this spec only
// covers this page's own load/actions, not the membership gate itself
// (already covered by embed-organization.spec.ts's layout tests).

function formRequest(fields: Record<string, string | string[]>): Request {
	const form = new FormData()
	for (const [key, value] of Object.entries(fields)) {
		if (Array.isArray(value)) {
			for (const v of value) form.append(key, v)
		} else {
			form.append(key, value)
		}
	}
	return new Request('http://web.internal/organizations/org-1/applications/widgetco/api-keys', { method: 'POST', body: form })
}

describe('(embed)/organizations/[organizationId]/applications/[applicationSlug]/api-keys page load', () => {
	it('reports canManage=false when the caller is a manager but the org lacks api-keys:manage for this app', async () => {
		const tower = createFakeTowerClient({
			organizations: [fakeOrganization({ organizationId: 'org-1', grantedRoles: [{ application: 'widgetco', role: 'read' }] })],
		})
		const session = fakeSession({ accountId: 'acct-1' })
		const result = await load({
			locals: { session, clients: { tower } },
			params: { organizationId: 'org-1', applicationSlug: 'widgetco' },
			parent: async () => ({ session, theme: {}, isManager: true }),
		} as Parameters<typeof load>[0])

		expect(result.canManage).toBe(false)
		expect(tower.listOrganizationApiKeys).not.toHaveBeenCalled()
	})

	it('reports canManage=false for a non-manager even when the org holds api-keys:manage', async () => {
		const tower = createFakeTowerClient({
			organizations: [fakeOrganization({ organizationId: 'org-1', grantedRoles: [{ application: 'widgetco', role: 'api-keys:manage' }] })],
		})
		const session = fakeSession({ accountId: 'acct-1' })
		const result = await load({
			locals: { session, clients: { tower } },
			params: { organizationId: 'org-1', applicationSlug: 'widgetco' },
			parent: async () => ({ session, theme: {}, isManager: false }),
		} as Parameters<typeof load>[0])

		expect(result.canManage).toBe(false)
	})

	it('lists the organization\'s keys when the caller is a manager and the org holds api-keys:manage', async () => {
		const tower = createFakeTowerClient({
			organizations: [fakeOrganization({
				organizationId: 'org-1',
				grantedRoles: [
					{ application: 'widgetco', role: 'api-keys:manage' },
					{ application: 'widgetco', role: 'read' },
				],
			})],
			apiKeys: [fakeApiKey({ apiKeyId: 'apikey-1', application: 'widgetco', owner: { organization: 'org-1' } })],
		})
		const session = fakeSession({ accountId: 'acct-1' })
		const result = await load({
			locals: { session, clients: { tower } },
			params: { organizationId: 'org-1', applicationSlug: 'widgetco' },
			parent: async () => ({ session, theme: {}, isManager: true }),
		} as Parameters<typeof load>[0])

		expect(result.canManage).toBe(true)
		expect(result.availableRoles.sort()).toEqual(['api-keys:manage', 'read'])
		expect(result.keys.map((k) => k.apiKeyId)).toEqual(['apikey-1'])
	})

	it('404s for an organization that does not exist', async () => {
		const tower = createFakeTowerClient()
		const session = fakeSession({ accountId: 'acct-1' })
		try {
			await load({
				locals: { session, clients: { tower } },
				params: { organizationId: 'nonexistent', applicationSlug: 'widgetco' },
				parent: async () => ({ session, theme: {}, isManager: false }),
			} as Parameters<typeof load>[0])
			expect.unreachable('expected a 404')
		} catch (err) {
			expect(isHttpError(err)).toBe(true)
			if (isHttpError(err)) expect(err.status).toBe(404)
		}
	})
})

describe('(embed)/organizations/[organizationId]/applications/[applicationSlug]/api-keys actions', () => {
	const session = fakeSession({ accountId: 'acct-1', organizationMemberships: [{ organizationId: 'org-1', roles: ['manager', 'member'] }] })

	it('create forwards to tower and returns the one-time secret', async () => {
		const tower = createFakeTowerClient({ organizations: [fakeOrganization({ organizationId: 'org-1' })] })
		const result = await actions.create({
			request: formRequest({ name: 'org key', grantedRoles: ['read'] }),
			locals: { session, clients: { tower } },
			params: { organizationId: 'org-1', applicationSlug: 'widgetco' },
		} as Parameters<typeof actions.create>[0])

		expect(result?.success).toBe(true)
		expect((result as { created: { secret: string } })?.created.secret).toMatch(/^authstar_/)
		expect(tower.createOrganizationApiKey).toHaveBeenCalledWith('acme', 'org-1', 'widgetco', { name: 'org key', grantedRoles: ['read'] })
	})

	it('403s any action for a caller who is not a member of this organization at all', async () => {
		const tower = createFakeTowerClient({ organizations: [fakeOrganization({ organizationId: 'org-1' })] })
		const outsider = fakeSession({ accountId: 'acct-9', organizationMemberships: [{ organizationId: 'org-2', roles: ['member'] }] })
		try {
			await actions.create({
				request: formRequest({ name: 'org key', grantedRoles: ['read'] }),
				locals: { session: outsider, clients: { tower } },
				params: { organizationId: 'org-1', applicationSlug: 'widgetco' },
			} as Parameters<typeof actions.create>[0])
			expect.unreachable('expected a 403')
		} catch (err) {
			expect(isHttpError(err)).toBe(true)
			if (isHttpError(err)) expect(err.status).toBe(403)
		}
	})

	it('revoke forwards to tower', async () => {
		const tower = createFakeTowerClient({
			organizations: [fakeOrganization({ organizationId: 'org-1' })],
			apiKeys: [fakeApiKey({ apiKeyId: 'apikey-1', application: 'widgetco', owner: { organization: 'org-1' } })],
		})
		const result = await actions.revoke({
			request: formRequest({ apiKeyId: 'apikey-1' }),
			locals: { session, clients: { tower } },
			params: { organizationId: 'org-1', applicationSlug: 'widgetco' },
		} as Parameters<typeof actions.revoke>[0])

		expect(result?.success).toBe(true)
		expect(tower.revokeOrganizationApiKey).toHaveBeenCalledWith('acme', 'org-1', 'widgetco', 'apikey-1')
	})
})

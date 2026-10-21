import { describe, expect, it } from 'vitest'
import { load as loadLayout } from '../../src/routes/(embed)/applications/[applicationSlug]/api-keys/+layout.server'
import { actions, load } from '../../src/routes/(embed)/applications/[applicationSlug]/api-keys/+page.server'
import { createFakeTowerClient, fakeAccount, fakeApiKey } from '../fixtures/fake-tower-client'
import { fakeSession } from '../fixtures/fake-session'

// Behavior tier: design/adrs/0101-api-keys.md's personal-keys embed
// surface -- the first individual-account-scoped (not organization-scoped)
// embed route in `web`, gated on `requireSession` alone (self-service).

function formRequest(fields: Record<string, string | string[]>): Request {
	const form = new FormData()
	for (const [key, value] of Object.entries(fields)) {
		if (Array.isArray(value)) {
			for (const v of value) form.append(key, v)
		} else {
			form.append(key, value)
		}
	}
	return new Request('http://web.internal/applications/widgetco/api-keys', { method: 'POST', body: form })
}

describe('(embed)/applications/[applicationSlug]/api-keys layout load', () => {
	it('401s when there is no session at all', async () => {
		const { isHttpError } = await import('@sveltejs/kit')
		try {
			await loadLayout({
				locals: { session: null },
				url: new URL('http://web.internal/applications/widgetco/api-keys'),
			} as Parameters<typeof loadLayout>[0])
			expect.unreachable('expected a 401')
		} catch (err) {
			expect(isHttpError(err)).toBe(true)
			if (isHttpError(err)) expect(err.status).toBe(401)
		}
	})

	it('requires no organization membership at all -- self-service, unlike the org embed layout', async () => {
		const session = fakeSession({ organizationMemberships: [] })
		const result = await loadLayout({
			locals: { session },
			url: new URL('http://web.internal/applications/widgetco/api-keys'),
		} as Parameters<typeof loadLayout>[0])
		expect(result.session).toBe(session)
	})
})

describe('(embed)/applications/[applicationSlug]/api-keys page load', () => {
	it('reports canManage=false and an empty list when the account does not hold api-keys:manage for this application', async () => {
		const tower = createFakeTowerClient({
			accounts: [fakeAccount({ accountId: 'acct-1', grantedRoles: [{ name: 'read', scope: { application: 'widgetco' } }] })],
		})
		const session = fakeSession({ accountId: 'acct-1' })
		const result = await load({
			locals: { session, clients: { tower } },
			params: { applicationSlug: 'widgetco' },
			parent: async () => ({ session, theme: {} }),
		} as Parameters<typeof load>[0])

		expect(result.canManage).toBe(false)
		expect(result.keys).toEqual([])
		expect(tower.listPersonalApiKeys).not.toHaveBeenCalled()
	})

	it('lists the account\'s own keys when it holds api-keys:manage', async () => {
		const tower = createFakeTowerClient({
			accounts: [fakeAccount({
				accountId: 'acct-1',
				grantedRoles: [
					{ name: 'api-keys:manage', scope: { application: 'widgetco' } },
					{ name: 'read', scope: { application: 'widgetco' } },
				],
			})],
			apiKeys: [fakeApiKey({ apiKeyId: 'apikey-1', application: 'widgetco', owner: { account: 'acct-1' } })],
		})
		const session = fakeSession({ accountId: 'acct-1' })
		const result = await load({
			locals: { session, clients: { tower } },
			params: { applicationSlug: 'widgetco' },
			parent: async () => ({ session, theme: {} }),
		} as Parameters<typeof load>[0])

		expect(result.canManage).toBe(true)
		expect(result.availableRoles.sort()).toEqual(['api-keys:manage', 'read'])
		expect(result.keys.map((k) => k.apiKeyId)).toEqual(['apikey-1'])
	})

	it('a tenant-scope granted role also counts toward availableRoles for any application', async () => {
		const tower = createFakeTowerClient({
			accounts: [fakeAccount({
				accountId: 'acct-1',
				grantedRoles: [
					{ name: 'api-keys:manage', scope: { application: 'widgetco' } },
					{ name: 'billing:view', scope: 'tenant' },
				],
			})],
		})
		const session = fakeSession({ accountId: 'acct-1' })
		const result = await load({
			locals: { session, clients: { tower } },
			params: { applicationSlug: 'widgetco' },
			parent: async () => ({ session, theme: {} }),
		} as Parameters<typeof load>[0])

		expect(result.availableRoles.sort()).toEqual(['api-keys:manage', 'billing:view'])
	})
})

describe('(embed)/applications/[applicationSlug]/api-keys actions', () => {
	const session = fakeSession({ accountId: 'acct-1' })

	it('create forwards the selected roles and returns the one-time secret', async () => {
		const tower = createFakeTowerClient()
		const result = await actions.create({
			request: formRequest({ name: 'ci key', grantedRoles: ['read', 'write'] }),
			locals: { session, clients: { tower } },
			params: { applicationSlug: 'widgetco' },
		} as Parameters<typeof actions.create>[0])

		expect(result?.success).toBe(true)
		expect((result as { created: { secret: string } })?.created.secret).toMatch(/^authstar_/)
		expect(tower.createPersonalApiKey).toHaveBeenCalledWith('acme', 'widgetco', { name: 'ci key', grantedRoles: ['read', 'write'] })
	})

	it('rejects a submission with no roles selected, without calling tower', async () => {
		const tower = createFakeTowerClient()
		const result = await actions.create({
			request: formRequest({ name: 'ci key', grantedRoles: [] }),
			locals: { session, clients: { tower } },
			params: { applicationSlug: 'widgetco' },
		} as Parameters<typeof actions.create>[0])

		expect(result?.status).toBe(400)
		expect(tower.createPersonalApiKey).not.toHaveBeenCalled()
	})

	it('revoke forwards to tower', async () => {
		const tower = createFakeTowerClient({
			apiKeys: [fakeApiKey({ apiKeyId: 'apikey-1', application: 'widgetco', owner: { account: 'acct-1' } })],
		})
		const result = await actions.revoke({
			request: formRequest({ apiKeyId: 'apikey-1' }),
			locals: { session, clients: { tower } },
			params: { applicationSlug: 'widgetco' },
		} as Parameters<typeof actions.revoke>[0])

		expect(result?.success).toBe(true)
		expect(tower.revokePersonalApiKey).toHaveBeenCalledWith('acme', 'widgetco', 'apikey-1')
	})
})

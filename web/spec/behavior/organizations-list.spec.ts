import { describe, expect, it } from 'vitest'
import { isHttpError } from '@sveltejs/kit'
import { load } from '../../src/routes/(admin)/billing/organizations/+page.server'
import { createFakeTowerClient, fakeOrganization } from '../fixtures/fake-tower-client'
import { fakeSession } from '../fixtures/fake-session'

// Behavior tier: ADR 0100's organizations list, exercised by calling the
// generated `load` function directly -- same pattern as the applications
// list's own contract test.

describe('organizations list load -- ADR 0100', () => {
	it('returns the tenant\'s organizations from tower', async () => {
		const tower = createFakeTowerClient({
			organizations: [fakeOrganization({ organizationId: 'org-1', name: 'Acme Corp' }), fakeOrganization({ organizationId: 'org-2', name: 'Widget Co' })],
		})
		const session = fakeSession({ permissions: ['billing:manage'] })

		const result = await load({
			locals: { session, clients: { tower } },
		} as Parameters<typeof load>[0])

		expect(result.organizations.map((o) => o.organizationId)).toEqual(['org-1', 'org-2'])
		expect(tower.listOrganizations).toHaveBeenCalledWith('acme')
	})

	it('403s an account with neither billing nor organization permissions', async () => {
		const tower = createFakeTowerClient()
		const session = fakeSession({ permissions: ['applications:manage'] })

		try {
			await load({ locals: { session, clients: { tower } } } as Parameters<typeof load>[0])
			expect.unreachable('expected load to throw a 403')
		} catch (err) {
			expect(isHttpError(err)).toBe(true)
			if (isHttpError(err)) expect(err.status).toBe(403)
		}
	})

	it('401s when there is no session at all', async () => {
		const tower = createFakeTowerClient()

		try {
			await load({ locals: { session: null, clients: { tower } } } as Parameters<typeof load>[0])
			expect.unreachable('expected load to throw a 401')
		} catch (err) {
			expect(isHttpError(err)).toBe(true)
			if (isHttpError(err)) expect(err.status).toBe(401)
		}
	})
})

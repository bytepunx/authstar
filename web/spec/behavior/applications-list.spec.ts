import { describe, expect, it } from 'vitest'
import { isHttpError } from '@sveltejs/kit'
import { load } from '../../src/routes/(admin)/applications/+page.server'
import { createFakeTowerClient, fakeApplication } from '../fixtures/fake-tower-client'
import { fakeSession } from '../fixtures/fake-session'

// Behavior tier: Story 003's List contract, exercised by calling the
// generated `load` function directly (no HTTP, no browser) with a faked
// tower client on `locals` -- exactly what a +page.server.ts's own
// contract test looks like for a SvelteKit app, per this project's own
// TESTING.md.

describe('applications list load -- Story 003', () => {
	it('returns the tenant\'s applications from tower, unfiltered by this route (tower already excludes _admin)', async () => {
		const tower = createFakeTowerClient({
			applications: [fakeApplication({ slug: 'widgetco' }), fakeApplication({ slug: 'gizmoco', name: 'Gizmo Co' })],
		})
		const session = fakeSession({ permissions: ['applications:manage'] })

		const result = await load({
			locals: { session, clients: { tower } },
		} as Parameters<typeof load>[0])

		expect(result.applications.map((a) => a.slug)).toEqual(['widgetco', 'gizmoco'])
		expect(tower.listApplications).toHaveBeenCalledWith('acme')
	})

	it('403s an account without applications:manage -- route guard backs the nav hiding (Story 001)', async () => {
		const tower = createFakeTowerClient()
		const session = fakeSession({ permissions: ['billing:read'] })

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

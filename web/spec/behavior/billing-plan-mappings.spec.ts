import { describe, expect, it } from 'vitest'
import { isHttpError, isRedirect } from '@sveltejs/kit'
import { actions, load } from '../../src/routes/(admin)/billing/plan-mappings/+page.server'
import { actions as newActions } from '../../src/routes/(admin)/billing/plan-mappings/new/+page.server'
import { createFakeKeepClient, fakePlanMapping } from '../fixtures/fake-keep-client'
import { fakeSession } from '../fixtures/fake-session'

function formRequest(fields: Record<string, string>): Request {
	const form = new FormData()
	for (const [key, value] of Object.entries(fields)) form.append(key, value)
	return new Request('http://web.internal/billing/plan-mappings', { method: 'POST', body: form })
}

describe('billing/plan-mappings list load', () => {
	it('returns the tenant\'s active plan mappings from keep', async () => {
		const keep = createFakeKeepClient({
			planMappings: [fakePlanMapping({ id: 'pm_1', name: 'Family' }), fakePlanMapping({ id: 'pm_2', name: 'Business' })],
		})
		const session = fakeSession({ permissions: ['billing:manage'] })

		const result = await load({ locals: { session, clients: { keep } } } as Parameters<typeof load>[0])
		expect(result.planMappings.map((m) => m.id)).toEqual(['pm_1', 'pm_2'])
	})

	it('403s without billing:read/manage', async () => {
		const keep = createFakeKeepClient()
		const session = fakeSession({ permissions: ['applications:manage'] })

		try {
			await load({ locals: { session, clients: { keep } } } as Parameters<typeof load>[0])
			expect.unreachable('expected load to throw a 403')
		} catch (err) {
			expect(isHttpError(err)).toBe(true)
			if (isHttpError(err)) expect(err.status).toBe(403)
		}
	})
})

describe('billing/plan-mappings retire action', () => {
	it('retires the given mapping by id', async () => {
		const keep = createFakeKeepClient({ planMappings: [fakePlanMapping({ id: 'pm_1' })] })
		const session = fakeSession({ permissions: ['billing:manage'] })

		await actions.retire({
			request: formRequest({ id: 'pm_1' }),
			locals: { session, clients: { keep } },
		} as Parameters<typeof actions.retire>[0])

		expect(keep.retirePlanMapping).toHaveBeenCalledWith('acme', 'pm_1')
	})
})

describe('billing/plan-mappings/new create action', () => {
	it('parses "application:role" pairs and creates the mapping', async () => {
		const keep = createFakeKeepClient()
		const session = fakeSession({ permissions: ['billing:manage'] })

		try {
			await newActions.default({
				request: formRequest({
					stripePriceId: 'price_family',
					name: 'Family',
					grantedRoles: 'loci:plan-family, loci:plan-business',
				}),
				locals: { session, clients: { keep } },
			} as Parameters<typeof newActions.default>[0])
			expect.unreachable('expected a redirect')
		} catch (err) {
			expect(isRedirect(err)).toBe(true)
		}

		expect(keep.createPlanMapping).toHaveBeenCalledWith('acme', {
			stripePriceId: 'price_family',
			name: 'Family',
			seatLimit: null,
			grantedRoles: [
				{ application: 'loci', role: 'plan-family' },
				{ application: 'loci', role: 'plan-business' },
			],
			meter: null,
		})
	})

	it('rejects a malformed granted-role entry without calling keep', async () => {
		const keep = createFakeKeepClient()
		const session = fakeSession({ permissions: ['billing:manage'] })

		const result = await newActions.default({
			request: formRequest({ stripePriceId: 'price_1', name: 'Plan', grantedRoles: 'not-a-pair' }),
			locals: { session, clients: { keep } },
		} as Parameters<typeof newActions.default>[0])

		expect(result?.status).toBe(400)
		expect(result?.data?.fieldErrors?.grantedRoles).toContain('not-a-pair')
		expect(keep.createPlanMapping).not.toHaveBeenCalled()
	})

	it('rejects a submission missing required fields', async () => {
		const keep = createFakeKeepClient()
		const session = fakeSession({ permissions: ['billing:manage'] })

		const result = await newActions.default({
			request: formRequest({ stripePriceId: '', name: '' }),
			locals: { session, clients: { keep } },
		} as Parameters<typeof newActions.default>[0])

		expect(result?.status).toBe(400)
		expect(result?.data?.fieldErrors).toMatchObject({ stripePriceId: expect.any(String), name: expect.any(String) })
	})
})

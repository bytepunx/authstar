import { describe, expect, it } from 'vitest'
import { isHttpError, isRedirect } from '@sveltejs/kit'
import { load } from '../../src/routes/(admin)/billing/plan-mappings/+page.server'
import { actions as newActions } from '../../src/routes/(admin)/billing/plan-mappings/new/+page.server'
import { actions as detailActions, load as loadDetail } from '../../src/routes/(admin)/billing/plan-mappings/[id]/+page.server'
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

describe('billing/plan-mappings/[id] detail load', () => {
	it('returns the mapping by id', async () => {
		const keep = createFakeKeepClient({ planMappings: [fakePlanMapping({ id: 'pm_1', name: 'Family' })] })
		const session = fakeSession({ permissions: ['billing:manage'] })

		const result = await loadDetail({
			locals: { session, clients: { keep } },
			params: { id: 'pm_1' },
		} as Parameters<typeof loadDetail>[0])
		expect(result.planMapping.name).toBe('Family')
	})

	it('404s for an unknown id', async () => {
		const keep = createFakeKeepClient()
		const session = fakeSession({ permissions: ['billing:manage'] })

		try {
			await loadDetail({
				locals: { session, clients: { keep } },
				params: { id: 'pm_missing' },
			} as Parameters<typeof loadDetail>[0])
			expect.unreachable('expected load to throw a 404')
		} catch (err) {
			expect(isHttpError(err)).toBe(true)
			if (isHttpError(err)) expect(err.status).toBe(404)
		}
	})
})

describe('billing/plan-mappings/[id] update action', () => {
	it('updates name/seatLimit/grantedRoles/meter, never touching stripePriceId', async () => {
		const keep = createFakeKeepClient({ planMappings: [fakePlanMapping({ id: 'pm_1', stripePriceId: 'price_original' })] })
		const session = fakeSession({ permissions: ['billing:manage'] })

		const result = await detailActions.update({
			request: formRequest({ name: 'Renamed', grantedRoles: 'loci:plan:business', seatLimit: '5', meter: 'seats' }),
			locals: { session, clients: { keep } },
			params: { id: 'pm_1' },
		} as Parameters<typeof detailActions.update>[0])

		expect(result).toEqual({ success: true })
		expect(keep.updatePlanMapping).toHaveBeenCalledWith('acme', 'pm_1', {
			name: 'Renamed',
			seatLimit: 5,
			grantedRoles: [{ application: 'loci', role: 'plan:business' }],
			meter: 'seats',
		})
	})

	it('rejects a submission missing name', async () => {
		const keep = createFakeKeepClient({ planMappings: [fakePlanMapping({ id: 'pm_1' })] })
		const session = fakeSession({ permissions: ['billing:manage'] })

		const result = await detailActions.update({
			request: formRequest({ name: '' }),
			locals: { session, clients: { keep } },
			params: { id: 'pm_1' },
		} as Parameters<typeof detailActions.update>[0])

		expect(result?.status).toBe(400)
		expect(result?.data?.fieldErrors).toMatchObject({ name: expect.any(String) })
		expect(keep.updatePlanMapping).not.toHaveBeenCalled()
	})
})

describe('billing/plan-mappings/[id] retire action', () => {
	it('retires the mapping and redirects to the list', async () => {
		const keep = createFakeKeepClient({ planMappings: [fakePlanMapping({ id: 'pm_1' })] })
		const session = fakeSession({ permissions: ['billing:manage'] })

		try {
			await detailActions.retire({
				locals: { session, clients: { keep } },
				params: { id: 'pm_1' },
			} as Parameters<typeof detailActions.retire>[0])
			expect.unreachable('expected a redirect')
		} catch (err) {
			expect(isRedirect(err)).toBe(true)
		}

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

	it('splits only on the first colon -- a role name that itself contains one is preserved whole', async () => {
		// Regression test: role names are an open, app-owned vocabulary that
		// routinely contain colons (e.g. tower's real "plan:business"/
		// "plan:family" roles) -- naively splitting each "application:role"
		// entry on every colon silently truncated the role to just "plan".
		const keep = createFakeKeepClient()
		const session = fakeSession({ permissions: ['billing:manage'] })

		try {
			await newActions.default({
				request: formRequest({
					stripePriceId: 'price_business',
					name: 'Business',
					grantedRoles: 'loci:plan:business',
				}),
				locals: { session, clients: { keep } },
			} as Parameters<typeof newActions.default>[0])
			expect.unreachable('expected a redirect')
		} catch (err) {
			expect(isRedirect(err)).toBe(true)
		}

		expect(keep.createPlanMapping).toHaveBeenCalledWith('acme', {
			stripePriceId: 'price_business',
			name: 'Business',
			seatLimit: null,
			grantedRoles: [{ application: 'loci', role: 'plan:business' }],
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

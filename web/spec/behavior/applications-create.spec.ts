import { describe, expect, it } from 'vitest'
import { isRedirect } from '@sveltejs/kit'
import { actions, load } from '../../src/routes/(admin)/applications/new/+page.server'
import { createFakeTowerClient } from '../fixtures/fake-tower-client'
import { fakeSession } from '../fixtures/fake-session'

function formRequest(fields: Record<string, string | string[]>): Request {
	const form = new FormData()
	for (const [key, value] of Object.entries(fields)) {
		if (Array.isArray(value)) {
			for (const v of value) form.append(key, v)
		} else {
			form.append(key, value)
		}
	}
	return new Request('http://web.internal/applications/new', { method: 'POST', body: form })
}

const validFields = {
	slug: 'widgetco',
	name: 'Widget Co',
	hosts: 'widgetco.acme.example.com',
	primaryHost: 'widgetco.acme.example.com',
	upstreamBaseUrl: 'http://widgetco.internal:8080',
}

describe('applications/new load -- Story 003 (Exposed Providers control)', () => {
	it('loads the tenant\'s provider catalog for the exposed-providers multi-select', async () => {
		const tower = createFakeTowerClient({ providers: [{ name: 'google', label: 'Google' }] })
		const result = await load({
			locals: { session: fakeSession(), clients: { tower } },
		} as Parameters<typeof load>[0])
		expect(result.providers).toEqual([{ name: 'google', label: 'Google' }])
	})
})

describe('applications/new create action -- Story 003', () => {
	it('creates the application and redirects to its detail page', async () => {
		const tower = createFakeTowerClient()
		const session = fakeSession()

		try {
			await actions.default({
				request: formRequest(validFields),
				locals: { session, clients: { tower } },
			} as Parameters<typeof actions.default>[0])
			expect.unreachable('expected a redirect')
		} catch (err) {
			expect(isRedirect(err)).toBe(true)
			if (isRedirect(err)) {
				expect(err.status).toBe(303)
				expect(err.location).toBe('/applications/widgetco')
			}
		}

		expect(tower.createApplication).toHaveBeenCalledWith(
			'acme',
			expect.objectContaining({ slug: 'widgetco', name: 'Widget Co' }),
		)
	})

	it('returns field errors (400) without calling tower when required fields are missing', async () => {
		const tower = createFakeTowerClient()
		const result = await actions.default({
			request: formRequest({ slug: '', name: '', hosts: '', primaryHost: '', upstreamBaseUrl: '' }),
			locals: { session: fakeSession(), clients: { tower } },
		} as Parameters<typeof actions.default>[0])

		expect(result?.status).toBe(400)
		expect(result?.data?.fieldErrors).toMatchObject({ slug: expect.any(String), name: expect.any(String) })
		expect(tower.createApplication).not.toHaveBeenCalled()
	})

	it('rejects a primary host that is not among the listed hosts', async () => {
		const tower = createFakeTowerClient()
		const result = await actions.default({
			request: formRequest({ ...validFields, primaryHost: 'not-a-listed-host.example.com' }),
			locals: { session: fakeSession(), clients: { tower } },
		} as Parameters<typeof actions.default>[0])

		expect(result?.status).toBe(400)
		expect(result?.data?.fieldErrors?.primaryHost).toBeDefined()
	})

	it('surfaces a tower rejection (e.g. duplicate slug) as a form error, not a 500', async () => {
		const tower = createFakeTowerClient({ rejectMutations: true })
		const result = await actions.default({
			request: formRequest(validFields),
			locals: { session: fakeSession(), clients: { tower } },
		} as Parameters<typeof actions.default>[0])

		expect(result?.status).toBe(409)
		expect(result?.data?.formError).toBeDefined()
	})

	it('403s an account without applications:manage', async () => {
		const tower = createFakeTowerClient()
		await expect(
			actions.default({
				request: formRequest(validFields),
				locals: { session: fakeSession({ permissions: [] }), clients: { tower } },
			} as Parameters<typeof actions.default>[0]),
		).rejects.toMatchObject({ status: 403 })
	})
})

import { describe, expect, it } from 'vitest'
import { isHttpError, isRedirect } from '@sveltejs/kit'
import { actions, load } from '../../src/routes/(admin)/applications/[slug]/+page.server'
import { createFakeTowerClient, fakeApplication } from '../fixtures/fake-tower-client'
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
	return new Request('http://web.internal/applications/widgetco', { method: 'POST', body: form })
}

describe('applications/[slug] load -- Story 003', () => {
	it('returns the application detail and provider catalog', async () => {
		const tower = createFakeTowerClient({ applications: [fakeApplication()] })
		const result = await load({
			locals: { session: fakeSession(), clients: { tower } },
			params: { slug: 'widgetco' },
		} as Parameters<typeof load>[0])
		expect(result.application.slug).toBe('widgetco')
		expect(result.providers.length).toBeGreaterThan(0)
	})

	it('404s for an application that does not exist -- never a broken partial render (Story 001)', async () => {
		const tower = createFakeTowerClient()
		try {
			await load({
				locals: { session: fakeSession(), clients: { tower } },
				params: { slug: 'nonexistent' },
			} as Parameters<typeof load>[0])
			expect.unreachable('expected a 404')
		} catch (err) {
			expect(isHttpError(err)).toBe(true)
			if (isHttpError(err)) expect(err.status).toBe(404)
		}
	})
})

describe('applications/[slug] update action -- Story 003', () => {
	it('never accepts a slug field even if a caller sends one -- slug is immutable', async () => {
		const tower = createFakeTowerClient({ applications: [fakeApplication()] })
		await actions.update({
			request: formRequest({
				slug: 'attempted-new-slug',
				name: 'Widget Co Renamed',
				hosts: 'widgetco.acme.example.com',
				primaryHost: 'widgetco.acme.example.com',
				upstreamBaseUrl: 'http://widgetco.internal:8080',
			}),
			locals: { session: fakeSession(), clients: { tower } },
			params: { slug: 'widgetco' },
		} as Parameters<typeof actions.update>[0])

		const call = (tower.updateApplication as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]
		expect(call[1]).toBe('widgetco') // slug came from the route param, not the form
		expect((call[2] as Record<string, unknown>).slug).toBeUndefined()
	})

	it('surfaces a tower rejection as a form error', async () => {
		const tower = createFakeTowerClient({ applications: [fakeApplication()], rejectMutations: true })
		const result = await actions.update({
			request: formRequest({ name: 'X', hosts: 'h', primaryHost: 'h', upstreamBaseUrl: 'http://x' }),
			locals: { session: fakeSession(), clients: { tower } },
			params: { slug: 'widgetco' },
		} as Parameters<typeof actions.update>[0])
		expect(result?.status).toBe(409)
	})
})

describe('applications/[slug] delete action -- Story 003', () => {
	it('calls DELETE (soft alias for status: deleted server-side) and redirects to the list', async () => {
		const tower = createFakeTowerClient({ applications: [fakeApplication()] })
		try {
			await actions.delete({
				locals: { session: fakeSession(), clients: { tower } },
				params: { slug: 'widgetco' },
			} as Parameters<typeof actions.delete>[0])
			expect.unreachable('expected a redirect')
		} catch (err) {
			expect(isRedirect(err)).toBe(true)
			if (isRedirect(err)) expect(err.location).toBe('/applications')
		}
		expect(tower.deleteApplication).toHaveBeenCalledWith('acme', 'widgetco')
	})
})

describe('applications/[slug] usage-credential actions -- ADR 0079', () => {
	it('issues a credential, returning the secret once for the one-time-reveal panel', async () => {
		const tower = createFakeTowerClient({ applications: [fakeApplication()] })
		const result = await actions.issueCredential({
			locals: { session: fakeSession(), clients: { tower } },
			params: { slug: 'widgetco' },
		} as Parameters<typeof actions.issueCredential>[0])
		expect(result?.issuedCredential?.secret).toMatch(/^secret_/)
	})

	it('revokes a credential by id', async () => {
		const tower = createFakeTowerClient({ applications: [fakeApplication()] })
		await actions.issueCredential({
			locals: { session: fakeSession(), clients: { tower } },
			params: { slug: 'widgetco' },
		} as Parameters<typeof actions.issueCredential>[0])

		const result = await actions.revokeCredential({
			request: formRequest({ credentialId: 'cred_1' }),
			locals: { session: fakeSession(), clients: { tower } },
			params: { slug: 'widgetco' },
		} as Parameters<typeof actions.revokeCredential>[0])

		expect(result?.revoked).toBe('cred_1')
		expect(tower.revokeUsageCredential).toHaveBeenCalledWith('acme', 'widgetco', 'cred_1')
	})

	it('400s revokeCredential with no credentialId rather than calling tower', async () => {
		const tower = createFakeTowerClient({ applications: [fakeApplication()] })
		const result = await actions.revokeCredential({
			request: formRequest({}),
			locals: { session: fakeSession(), clients: { tower } },
			params: { slug: 'widgetco' },
		} as Parameters<typeof actions.revokeCredential>[0])
		expect(result?.status).toBe(400)
		expect(tower.revokeUsageCredential).not.toHaveBeenCalled()
	})
})

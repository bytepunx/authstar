import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createFakeTowerServer } from '../fixtures/fake-tower-server'
import { createTowerClient } from '../../src/lib/server/clients/tower'
import { load as listLoad } from '../../src/routes/(admin)/applications/+page.server'
import { load as newLoad, actions as newActions } from '../../src/routes/(admin)/applications/new/+page.server'
import { load as editLoad } from '../../src/routes/(admin)/applications/[slug]/+page.server'
import { fakeSession } from '../fixtures/fake-session'

// Integration tier (web's own judgment call, documented in TESTING.md):
// `web` owns no persistent state of its own -- there's no Postgres/
// consequent-postgres wiring the way tower/keep/herald's own integration
// tier proves. What's real to prove here instead is that `web`'s actual
// HTTP client (src/lib/server/clients/tower.ts) -- URL construction,
// header forwarding, JSON parsing, status-code-to-error-type mapping --
// works over a real network socket against a real (if fake) HTTP server,
// not just against an in-process object standing in for the interface
// (that's what spec/behavior already covers). Same route `load`/`actions`
// functions as the behavior tier, but wired to the real client instead of
// spec/fixtures/fake-tower-client.ts.

describe('applications -- integration (real HTTP client against a real server)', () => {
	let server: Server
	let baseUrl: string

	beforeAll(async () => {
		server = createFakeTowerServer()
		await new Promise<void>((resolve) => server.listen(0, resolve))
		const { port } = server.address() as AddressInfo
		baseUrl = `http://127.0.0.1:${port}`
	})

	afterAll(async () => {
		await new Promise<void>((resolve) => server.close(() => resolve()))
	})

	afterEach(async () => {
		await fetch(`${baseUrl}/__reset`, { method: 'POST' })
	})

	function locals(session = fakeSession()) {
		return {
			session,
			clients: {
				tower: createTowerClient({ baseUrl, authorization: 'fake-jwt', fetch }),
			},
		}
	}

	it('creates an application over real HTTP, then lists it', async () => {
		const session = fakeSession()
		const form = new FormData()
		form.set('slug', 'widgetco')
		form.set('name', 'Widget Co')
		form.set('hosts', 'widgetco.acme.example.com')
		form.set('primaryHost', 'widgetco.acme.example.com')
		form.set('upstreamBaseUrl', 'http://widgetco.internal:8080')

		await expect(
			newActions.default({
				request: new Request('http://web.internal/applications/new', { method: 'POST', body: form }),
				locals: locals(session),
			} as Parameters<typeof newActions.default>[0]),
		).rejects.toMatchObject({ status: 303 })

		const listResult = await listLoad({ locals: locals(session) } as Parameters<typeof listLoad>[0])
		expect(listResult.applications).toEqual([
			{ slug: 'widgetco', name: 'Widget Co', hosts: ['widgetco.acme.example.com'], status: 'active' },
		])
	})

	it('a 404 from the real server surfaces as a SvelteKit 404, not an unhandled exception', async () => {
		const session = fakeSession()
		await expect(
			editLoad({ locals: locals(session), params: { slug: 'nonexistent' } } as Parameters<typeof editLoad>[0]),
		).rejects.toMatchObject({ status: 404 })
	})

	it('the provider catalog round-trips real JSON over the wire', async () => {
		const session = fakeSession()
		const result = await newLoad({ locals: locals(session) } as Parameters<typeof newLoad>[0])
		expect(result.providers).toEqual([
			{ name: 'google', label: 'Google' },
			{ name: 'github', label: 'GitHub' },
		])
	})

	it('a duplicate-slug create is rejected by the real server with a 409, surfaced as a form error', async () => {
		const session = fakeSession()
		const makeForm = () => {
			const form = new FormData()
			form.set('slug', 'dupe')
			form.set('name', 'Dupe Co')
			form.set('hosts', 'dupe.acme.example.com')
			form.set('primaryHost', 'dupe.acme.example.com')
			form.set('upstreamBaseUrl', 'http://dupe.internal:8080')
			return form
		}

		await expect(
			newActions.default({
				request: new Request('http://web.internal/applications/new', { method: 'POST', body: makeForm() }),
				locals: locals(session),
			} as Parameters<typeof newActions.default>[0]),
		).rejects.toMatchObject({ status: 303 })

		const result = await newActions.default({
			request: new Request('http://web.internal/applications/new', { method: 'POST', body: makeForm() }),
			locals: locals(session),
		} as Parameters<typeof newActions.default>[0])

		expect(result?.status).toBe(409)
	})
})

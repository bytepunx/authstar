import { describe, expect, it } from 'vitest'
import { load } from '../../src/routes/(hosted)/oauth2/select/+page.server'

// Story 010: "No live API call of any kind" -- this load function reads
// two headers and renders, nothing else. No session, no tower client.

function eventWithHeaders(headers: Record<string, string>) {
	return {
		request: new Request('http://widgetco.acme.example.com/oauth2/select', { headers }),
	} as Parameters<typeof load>[0]
}

describe('/oauth2/select load -- Story 010', () => {
	it('renders the branding and provider list from the headers portcullis attaches', async () => {
		const branding = { productName: 'Acme', logoUrl: 'https://cdn.example.com/acme.svg', primaryColor: '#123456' }
		const providers = [{ name: 'google', label: 'Google', loginPath: '/oauth2/google/login' }]

		const result = await load(
			eventWithHeaders({
				'x-authstar-tenant-branding': JSON.stringify(branding),
				'x-authstar-providers': JSON.stringify(providers),
			}),
		)

		expect(result.branding).toEqual(branding)
		expect(result.providers).toEqual(providers)
	})

	it('falls back to generic defaults when headers are absent -- never throws', async () => {
		const result = await load(eventWithHeaders({}))
		expect(result.branding.productName).toBe('authstar')
		expect(result.providers).toEqual([])
	})

	it('falls back to generic defaults when a header is malformed JSON -- never throws', async () => {
		const result = await load(
			eventWithHeaders({
				'x-authstar-tenant-branding': '{not valid json',
				'x-authstar-providers': '[also not valid',
			}),
		)
		expect(result.branding.productName).toBe('authstar')
		expect(result.providers).toEqual([])
	})
})

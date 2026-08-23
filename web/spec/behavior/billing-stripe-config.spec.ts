import { describe, expect, it } from 'vitest'
import { isHttpError } from '@sveltejs/kit'
import { actions, load } from '../../src/routes/(admin)/billing/stripe-config/+page.server'
import { createFakeKeepClient } from '../fixtures/fake-keep-client'
import { fakeSession } from '../fixtures/fake-session'

// Behavior tier: the "empty admin dashboard" gap this whole page closes --
// there was previously no path from a logged-in tenant admin's session to
// keep's stripe-config route at all (keep has no operator-token bypass,
// unlike tower). Exercised the same way applications-create.spec.ts does:
// calling the generated `load`/`actions` directly.

function formRequest(fields: Record<string, string>): Request {
	const form = new FormData()
	for (const [key, value] of Object.entries(fields)) form.append(key, value)
	return new Request('http://web.internal/billing/stripe-config', { method: 'POST', body: form })
}

describe('billing/stripe-config load', () => {
	it('reports configured: false when keep has no stripe-config for this tenant yet', async () => {
		const keep = createFakeKeepClient({ stripeConfigured: false })
		const session = fakeSession({ permissions: ['billing:manage'] })

		const result = await load({ locals: { session, clients: { keep } } } as Parameters<typeof load>[0])
		expect(result.configured).toBe(false)
	})

	it('reports configured: true once keep has one', async () => {
		const keep = createFakeKeepClient({ stripeConfigured: true })
		const session = fakeSession({ permissions: ['billing:read'] })

		const result = await load({ locals: { session, clients: { keep } } } as Parameters<typeof load>[0])
		expect(result.configured).toBe(true)
	})

	it('403s an account without billing:read/manage', async () => {
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

describe('billing/stripe-config set action', () => {
	it('rejects a submission missing either field', async () => {
		const keep = createFakeKeepClient()
		const session = fakeSession({ permissions: ['billing:manage'] })

		const result = await actions.default({
			request: formRequest({ secretKey: '' }),
			locals: { session, clients: { keep } },
		} as Parameters<typeof actions.default>[0])

		expect(result?.status).toBe(400)
		expect(result?.data?.fieldErrors).toMatchObject({ secretKey: expect.any(String), webhookSecret: expect.any(String) })
		expect(keep.setStripeConfig).not.toHaveBeenCalled()
	})

	it('sets the config and never echoes the secret values back', async () => {
		const keep = createFakeKeepClient()
		const session = fakeSession({ permissions: ['billing:manage'] })

		const result = await actions.default({
			request: formRequest({ secretKey: 'sk_live_abc', webhookSecret: 'whsec_abc' }),
			locals: { session, clients: { keep } },
		} as Parameters<typeof actions.default>[0])

		expect(result).toEqual({ success: true })
		expect(JSON.stringify(result)).not.toContain('sk_live_abc')
		expect(keep.setStripeConfig).toHaveBeenCalledWith('acme', { secretKey: 'sk_live_abc', webhookSecret: 'whsec_abc' })
	})
})

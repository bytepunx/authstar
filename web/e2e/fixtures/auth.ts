import type { APIRequestContext, BrowserContext } from '@playwright/test'
import { FAKE_BACKEND_URL } from './urls'

export interface FakeSessionClaims {
	// The user's email -- portcullis has no separate email claim, `sub` is
	// it verbatim (jwt/{session,internal}.rs). No `email` field here for the
	// same reason.
	sub?: string
	accountId?: string
	roles?: string[]
	permissions?: string[]
	enrichmentStatus?: 'ok' | 'degraded'
}

/**
 * Mints a real internal JWT via the fake backend's `/__sign` (signed with
 * the same key it publishes at `/__jwks`, which `web`'s own
 * INTERNAL_JWT_JWKS_URL points at -- see playwright.config.ts), then
 * attaches it plus the tenant-slug header to every request the given
 * context makes, exactly as portcullis would attach them on a real proxied
 * request (Story 010 / this repo's own documented header-name assumption
 * in hooks.server.ts).
 */
export async function authenticateAs(
	context: BrowserContext,
	request: APIRequestContext,
	tenantSlug: string,
	claims: FakeSessionClaims,
): Promise<void> {
	const response = await request.post(`${FAKE_BACKEND_URL}/__sign`, {
		data: {
			sub: 'e2e-user@acme.example.com',
			accountId: 'account_e2e',
			roles: ['admin'],
			enrichmentStatus: 'ok',
			...claims,
		},
	})
	const { token } = (await response.json()) as { token: string }
	await context.setExtraHTTPHeaders({
		authorization: `Bearer ${token}`,
		'x-authstar-tenant': tenantSlug,
	})
}

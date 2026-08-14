import type { APIRequestContext, BrowserContext } from '@playwright/test'
import { FAKE_BACKEND_URL } from './urls'

export interface FakeSessionClaims {
	// The user's email -- portcullis has no separate email claim, `sub` is
	// it verbatim (jwt/{session,internal}.rs). No `email` field here for the
	// same reason.
	sub?: string
	idp?: string
	identityHash?: string
	accountId?: string
	roles?: string[]
	permissions?: string[]
	enrichmentStatus?: 'ok' | 'degraded'
}

/**
 * Mints a real internal JWT via the fake backend's `/__sign` (signed with
 * the same key it publishes at `/__jwks`, which `web`'s own
 * INTERNAL_JWT_JWKS_URL points at -- see playwright.config.ts), then
 * attaches it to every request the given context makes, exactly as
 * portcullis would attach it on a real proxied request (Story 010).
 *
 * `tenantSlug` is sent to `/__sign` and lands on the token's own protected
 * header (ADR 0089), the same place a real portcullis puts it -- `web`
 * sources `session.tenantSlug` from there after verification, never from a
 * request header. There used to be an `x-authstar-tenant` header set here
 * too; ADR 0089 confirmed that assumption was simply wrong (nothing on
 * portcullis's real proxy path ever sets it), so it's gone, not replaced.
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
			idp: 'dex',
			identityHash: 'e2e-identity-hash',
			accountId: 'account_e2e',
			roles: ['admin'],
			enrichmentStatus: 'ok',
			...claims,
			tenant: tenantSlug,
		},
	})
	const { token } = (await response.json()) as { token: string }
	await context.setExtraHTTPHeaders({
		authorization: `Bearer ${token}`,
	})
}

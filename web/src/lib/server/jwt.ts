import { jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose'
import type { Session } from './session'

// Verification of the internal JWT portcullis forwards as `Authorization:
// Bearer` (proxy Story 010). Real key resolution is via each tenant's own
// ES256 internal-token keypair, delivered through signet -- wiring the real
// `@bytepunx/signet-client` JWKS resolution is out of scope for this slice
// (see TESTING.md's "deferred" list); `getKey` is injected here specifically
// so hooks.server.ts can supply the real signet-backed resolver in
// production while tests supply a local keypair, without this function
// caring which.

export interface InternalJwtClaims extends JWTPayload {
	sub: string
	idp?: string
	identityHash?: string
	accountId?: string
	roles?: string[]
	permissions?: string[]
	usage?: unknown[]
	enrichment_status?: 'ok' | 'degraded'
	email?: string
}

export class InvalidInternalJwtError extends Error {}

/**
 * Verifies and decodes an internal JWT into this app's `Session` shape.
 * `degraded` tokens (Story 010: portcullis's fail-open path, tower
 * unreachable) deliberately collapse to empty roles/permissions -- no
 * grant was ever fabricated by portcullis for this token, so this app must
 * not either.
 */
export async function verifyInternalJwt(
	token: string,
	getKey: JWTVerifyGetKey,
	tenantSlug: string,
): Promise<Session> {
	let payload: InternalJwtClaims
	try {
		const result = await jwtVerify<InternalJwtClaims>(token, getKey)
		payload = result.payload
	} catch (err) {
		throw new InvalidInternalJwtError(err instanceof Error ? err.message : 'invalid internal JWT')
	}

	if (!payload.sub) {
		throw new InvalidInternalJwtError('internal JWT missing required "sub" claim')
	}

	const enrichmentStatus: 'ok' | 'degraded' = payload.enrichment_status === 'degraded' ? 'degraded' : 'ok'
	const isOk = enrichmentStatus === 'ok'

	return {
		sub: payload.sub,
		accountId: isOk ? (payload.accountId ?? '') : '',
		tenantSlug,
		email: payload.email ?? null,
		roles: isOk ? (payload.roles ?? []) : [],
		permissions: isOk ? (payload.permissions ?? []) : [],
		enrichmentStatus,
	}
}

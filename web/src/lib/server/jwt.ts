import { verifyInternalJwt as verifyInternalJwtCore, AuthstarJwtError, type JWTVerifyGetKey } from '@bytepunx/authstar-core'
import type { Session } from './session'

// Verification of the internal JWT portcullis forwards as `Authorization:
// Bearer` (proxy Story 010), delegated to @bytepunx/authstar-core rather
// than hand-rolled here -- it's the same claim-parsing logic (enrichmentStatus
// casing, sub-is-email) this file used to duplicate, now maintained in one
// place across every authstar service. Real key resolution is via each
// tenant's own ES256 internal-token keypair (ADR 0086/0087); which tenant is
// ADR 0089's concern -- the token's own protected header carries a `tenant`
// hint, read by `getKey` (constructed in hooks.server.ts) *before*
// verification to select which tenant's JWKS to check against, and again
// here, from the *verified* claims, to stamp onto the returned `Session`.
// Never from a request header -- see hooks.server.ts's own comment on why
// this app previously (wrongly) trusted a forwarded `x-authstar-tenant`
// header that nothing ever set in production.

export class InvalidInternalJwtError extends Error {}

/**
 * Verifies and decodes an internal JWT into this app's `Session` shape.
 * `degraded` tokens (Story 010: portcullis's fail-open path, tower
 * unreachable) deliberately collapse to empty roles/permissions -- no
 * grant was ever fabricated by portcullis for this token, so this app must
 * not either.
 */
export async function verifyInternalJwt(token: string, getKey: JWTVerifyGetKey): Promise<Session> {
	let claims: Awaited<ReturnType<typeof verifyInternalJwtCore>>
	try {
		claims = await verifyInternalJwtCore(token, getKey)
	} catch (err) {
		if (err instanceof AuthstarJwtError) {
			throw new InvalidInternalJwtError(err.message)
		}
		throw err
	}

	const isOk = claims.enrichmentStatus === 'ok'

	return {
		sub: claims.sub,
		accountId: isOk ? (claims.accountId ?? '') : '',
		tenantSlug: claims.tenant,
		email: claims.sub,
		roles: isOk ? claims.roles : [],
		permissions: isOk ? claims.permissions : [],
		organizationMemberships: isOk ? claims.organizationMemberships : [],
		enrichmentStatus: claims.enrichmentStatus,
	}
}

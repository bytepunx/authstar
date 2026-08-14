import { jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose'
import type { Session } from './session'

// Verification of the internal JWT portcullis forwards as `Authorization:
// Bearer` (proxy Story 010). Real key resolution is via each tenant's own
// ES256 internal-token keypair, published by portcullis at
// `https://<tenant-host>/.well-known/jwks.json` (ADR 0086/0087) -- fetched
// with `jose`'s own `createRemoteJWKSet` in `hooks.server.ts` when
// `INTERNAL_JWT_JWKS_URL` is set. `getKey` is injected here specifically so
// hooks.server.ts can supply that real resolver in production while tests
// supply a local keypair, without this function caring which.

export interface InternalJwtClaims extends JWTPayload {
	// `sub` is the user's email, verbatim -- portcullis has no separate
	// `email` claim (confirmed against authstar-middleware's jwt/{session,
	// internal}.rs, both of which document this explicitly on `sub` itself).
	// There is no `email` field on this interface for exactly that reason;
	// read `sub` directly rather than expecting one.
	sub: string
	idp?: string
	identityHash?: string
	accountId?: string
	roles?: string[]
	permissions?: string[]
	usage?: unknown[]
	// camelCase on the wire -- `#[serde(rename = "enrichmentStatus")]` in
	// portcullis's InternalClaims (jwt/internal.rs). Previously read as
	// `enrichment_status` here, which never matched anything portcullis
	// actually sends, so every token -- including genuinely degraded,
	// fail-open ones -- was silently treated as "ok".
	enrichmentStatus?: 'ok' | 'degraded'
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

	const enrichmentStatus: 'ok' | 'degraded' = payload.enrichmentStatus === 'degraded' ? 'degraded' : 'ok'
	const isOk = enrichmentStatus === 'ok'

	return {
		sub: payload.sub,
		accountId: isOk ? (payload.accountId ?? '') : '',
		tenantSlug,
		email: payload.sub,
		roles: isOk ? (payload.roles ?? []) : [],
		permissions: isOk ? (payload.permissions ?? []) : [],
		enrichmentStatus,
	}
}

import type { Handle } from '@sveltejs/kit'
import { createRemoteJWKSet } from 'jose'
import { env } from '$env/dynamic/private'
import { InvalidInternalJwtError, verifyInternalJwt } from '$lib/server/jwt'
import { createTowerClient } from '$lib/server/clients/tower'

// Real signet-backed JWKS resolution (per-tenant ES256 internal-token keys,
// portcullis Story 010) is out of scope for this slice -- see TESTING.md's
// deferred list. `INTERNAL_JWT_JWKS_URL`, if configured, is treated as a
// single JWKS endpoint; lazily built once and reused across requests, the
// way `jose`'s own docs recommend (it caches/dedupes key fetches
// internally). Left unset, every request is treated as unauthenticated --
// safe for local/dev use of the (hosted) routes, which need no session at
// all, but means the (admin) tree's guard (`requireSession`) will 401
// everything until this is wired to a real signet-fed JWKS.
const jwksUrl = env.INTERNAL_JWT_JWKS_URL
const getKey = jwksUrl ? createRemoteJWKSet(new URL(jwksUrl)) : null

const towerBaseUrl = env.TOWER_BASE_URL ?? 'http://tower.internal:3000'

// Documented assumption (no portcullis story spells out the exact header
// name for this): the tenant slug portcullis already resolved from `Host`
// is attached as this header on every proxied request to `_admin`, the
// same "portcullis already has it, just attach it" principle ADR 0066
// establishes explicitly for the hosted pages' branding headers. Tests and
// local dev set it directly; production wiring of this depends on
// portcullis's actual proxy-through implementation (a portcullis-side
// story, not this repo).
const TENANT_HEADER = 'x-authstar-tenant'

export const handle: Handle = async ({ event, resolve }) => {
	const tenantSlug = event.request.headers.get(TENANT_HEADER)
	const authorization = event.request.headers.get('authorization')
	const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : null

	event.locals.session = null
	if (token && tenantSlug && getKey) {
		try {
			event.locals.session = await verifyInternalJwt(token, getKey, tenantSlug)
		} catch (err) {
			if (!(err instanceof InvalidInternalJwtError)) throw err
			// Falls through with session left `null` -- an unverifiable token
			// is treated identically to no token at all, never surfaced as a
			// 500. Downstream route guards produce the 401.
		}
	}

	event.locals.clients = {
		tower: createTowerClient({
			baseUrl: towerBaseUrl,
			authorization: token,
			fetch: event.fetch,
		}),
	}

	return resolve(event)
}

import type { Handle } from '@sveltejs/kit'
import { jwksKeyProvider, perTenantJwksKeyProvider } from '@bytepunx/authstar-core'
import { env } from '$env/dynamic/private'
import { InvalidInternalJwtError, verifyInternalJwt } from '$lib/server/jwt'
import { createTowerClient } from '$lib/server/clients/tower'

// ADR 0089: `web` is a single shared deployment serving every tenant, with
// no Host-based signal of its own -- there is no mechanism that would ever
// set a trustworthy forwarded tenant header (this file previously read
// `x-authstar-tenant`, an assumption ADR 0089 confirmed was simply wrong:
// nothing on portcullis's actual reverse-proxy path ever attaches it).
// Instead, the internal JWT carries its own tenant hint on its protected
// header, set by portcullis at mint time -- `perTenantJwksKeyProvider`
// reads it (before signature verification, the same safe pattern `kid`-
// based key selection already relies on) to resolve
// `https://admin.<tenant-slug>.<baseDomain>/.well-known/jwks.json` per
// request. `AUTHSTAR_BASE_DOMAIN` configures it.
//
// `INTERNAL_JWT_JWKS_URL`, if set, still takes precedence as a single fixed
// JWKS endpoint via `jwksKeyProvider` -- this is what e2e/dev point at a
// fixture server that doesn't (and shouldn't need to) stand up real
// per-tenant subdomains; see playwright.config.ts.
const jwksUrl = env.INTERNAL_JWT_JWKS_URL
const baseDomain = env.AUTHSTAR_BASE_DOMAIN
const getKey = jwksUrl ? jwksKeyProvider(jwksUrl) : baseDomain ? perTenantJwksKeyProvider(baseDomain) : null

const towerBaseUrl = env.TOWER_BASE_URL ?? 'http://tower.internal:3000'

export const handle: Handle = async ({ event, resolve }) => {
	const authorization = event.request.headers.get('authorization')
	const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : null

	event.locals.session = null
	if (token && getKey) {
		try {
			event.locals.session = await verifyInternalJwt(token, getKey)
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

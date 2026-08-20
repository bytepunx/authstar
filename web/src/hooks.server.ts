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
// `https://authstar.<tenant's own domain>/.well-known/jwks.json` per
// request (ADR 0091). A tenant's domain is no longer derivable from its
// slug by formula (every tenant brings its own, unrelated domain) --
// `perTenantJwksKeyProvider` takes a resolver function instead of a shared
// `baseDomain` string as of `@bytepunx/authstar-core@0.3.0`. `resolveDomain`
// below is backed by tower's own `GET /tenants/:slug` (the source of truth
// for `domain`, and deliberately unauthenticated -- confirmed directly
// against tower's `src/routes/tenants.ts`, no `preHandler` on the GET), with
// a simple in-process cache since tenants are added infrequently.
//
// `INTERNAL_JWT_JWKS_URL`, if set, still takes precedence as a single fixed
// JWKS endpoint via `jwksKeyProvider` -- this is what e2e/dev point at a
// fixture server that doesn't (and shouldn't need to) stand up real
// per-tenant domains; see playwright.config.ts.
const jwksUrl = env.INTERNAL_JWT_JWKS_URL

const towerBaseUrl = env.TOWER_BASE_URL ?? 'http://tower.internal:3000'

const tenantDomainCache = new Map<string, string>()
async function resolveTenantDomain(tenantSlug: string): Promise<string | undefined> {
	const cached = tenantDomainCache.get(tenantSlug)
	if (cached) return cached
	try {
		const response = await fetch(`${towerBaseUrl}/tenants/${encodeURIComponent(tenantSlug)}`)
		if (!response.ok) return undefined
		const body = (await response.json()) as { domain?: string }
		if (!body.domain) return undefined
		tenantDomainCache.set(tenantSlug, body.domain)
		return body.domain
	} catch {
		return undefined
	}
}

const getKey = jwksUrl ? jwksKeyProvider(jwksUrl) : perTenantJwksKeyProvider(resolveTenantDomain)

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

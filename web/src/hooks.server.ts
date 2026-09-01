import type { Handle } from '@sveltejs/kit'
import { jwksKeyProvider, perTenantJwksKeyProvider } from '@bytepunx/authstar-core'
import { InvalidInternalJwtError, verifyInternalJwt } from '$lib/server/jwt'
import { createTowerClient } from '$lib/server/clients/tower'
import { createKeepClient } from '$lib/server/clients/keep'
import { loadConfig } from '$lib/server/config'

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
//
// ADR 0102/Story 012: `towerBaseUrl`, `keepBaseUrl`, and `jwksUrl` below are
// resolved by `loadConfig()` (`$lib/server/config.ts`), which sources them
// from plain env (today's behavior, `TOWER_BASE_URL`'s
// `http://tower.internal:3000` fallback included) unless `SIGNET_ADDR` is
// set, in which case it dials signet and sources all three exclusively from
// the fetched bundle, failing startup loudly if the bundle is missing any
// of them. See that module's header comment for the full precedence
// rationale. Resolved once, at module load, via top-level await -- cheap in
// Env-Only Mode (no I/O at all), a one-time signet round trip in
// Signet-Configured Mode.
const config = await loadConfig()
const jwksUrl = config.internalJwtJwksUrl

const towerBaseUrl = config.towerBaseUrl
const keepBaseUrl = config.keepBaseUrl

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
		keep: createKeepClient({
			baseUrl: keepBaseUrl,
			authorization: token,
			fetch: event.fetch,
		}),
	}

	return resolve(event)
}

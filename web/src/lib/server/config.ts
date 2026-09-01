import { env } from '$env/dynamic/private'
import { dialWorkload, type WorkloadConnection } from '@bytepunx/signet-client'

// ADR 0102 ("Signet Precedence, Fallback Scope, and Missing-Field
// Behavior") brings web's plain config URLs (`TOWER_BASE_URL`,
// `KEEP_BASE_URL`, `INTERNAL_JWT_JWKS_URL`) into signet's scope, per Story
// 012. Two modes, gated purely on whether `SIGNET_ADDR` is set:
//
// - **Env-Only Mode** (`SIGNET_ADDR` unset): every field is sourced from
//   plain env, exactly as before this story -- a legitimate, permitted mode
//   for web (ADR 0102 softens ADR 0004's "no static-only mode" for exactly
//   the four services -- chronicle, lookout, steward, web -- that don't
//   already require signet unconditionally).
// - **Signet-Configured Mode** (`SIGNET_ADDR` set): the instant bootstrap
//   coordinates are present, web must dial signet and source
//   `towerBaseUrl`, `keepBaseUrl`, `internalJwtJwksUrl` *exclusively* from
//   the fetched bundle -- a conflicting env var, if still set, is ignored,
//   not merged or preferred. A bundle missing any of these three fields
//   fails startup loudly, naming the field and the signet
//   namespace/service path it needs provisioned -- no fallback to env, no
//   hardcoded literal default.
//
// `PUBLIC_TOWER_BASE_URL` is deliberately untouched by any of this -- it's
// read via `$env/dynamic/public` directly in `signup/+page.svelte`,
// intentionally outside the signet/secret boundary since it's
// client-visible (ADR 0102, web consequences).
//
// Unlike keep/herald/tower's own `src/server.ts` entrypoints, this module
// does not hold the signet connection open for `waitForRestart` -- those
// services are their own long-running Node process built specifically
// around that fetch-once/watch/restart-lock lifecycle; web is a SvelteKit
// app whose `hooks.server.ts` module just needs config resolved once
// before the first request is handled. Story 012 scopes this to "the
// minimal bootstrap surface" -- config sourcing, not the coordinated-
// restart machinery -- so the workload connection is closed again right
// after the one `GetServiceBundle` call.

export interface WebConfig {
	towerBaseUrl: string
	keepBaseUrl: string
	internalJwtJwksUrl: string | undefined
}

export interface LoadConfigDeps {
	dial: typeof dialWorkload
	env: Record<string, string | undefined>
}

// `env` defaults to the real `$env/dynamic/private` binding; both deps are
// injectable so tests can exercise both modes (and the fail-loud path)
// without depending on SvelteKit's dynamic-env module snapshot timing or a
// real SPIFFE workload socket -- the same "fake the boundary, not the
// framework" shape this repo's other spec/behavior tests use for
// tower/keep clients.
const defaultDeps: LoadConfigDeps = { dial: dialWorkload, env }

function requireEnv(vars: Record<string, string | undefined>, name: string): string {
	const value = vars[name]
	if (!value) throw new Error(`missing required environment variable ${name}`)
	return value
}

function requireBundleField(
	bundle: Record<string, unknown>,
	field: 'towerBaseUrl' | 'keepBaseUrl' | 'internalJwtJwksUrl',
	namespace: string,
	service: string,
): string {
	const value = bundle[field]
	if (typeof value !== 'string' || value.length === 0) {
		throw new Error(
			`signet bundle for ${namespace}/${service} is missing required field "${field}" -- web is in ` +
				`Signet-Configured Mode (SIGNET_ADDR is set) and per ADR 0102 does not fall back to env or a ` +
				`hardcoded default for this field; provision "${field}" in the ${namespace}/${service} signet bundle`,
		)
	}
	return value
}

function loadFromEnv(vars: Record<string, string | undefined>): WebConfig {
	return {
		towerBaseUrl: vars.TOWER_BASE_URL ?? 'http://tower.internal:3000',
		keepBaseUrl: vars.KEEP_BASE_URL ?? 'http://keep.internal:3000',
		internalJwtJwksUrl: vars.INTERNAL_JWT_JWKS_URL || undefined,
	}
}

async function loadFromSignet(signetAddr: string, deps: LoadConfigDeps): Promise<WebConfig> {
	const namespace = requireEnv(deps.env, 'SIGNET_NAMESPACE')
	const service = deps.env.SIGNET_SERVICE ?? 'web'
	const trustDomain = requireEnv(deps.env, 'SIGNET_TRUST_DOMAIN')

	let workload: WorkloadConnection
	try {
		workload = await deps.dial({ address: signetAddr, trustDomain })
	} catch (err) {
		throw new Error(`web: failed to dial signet at ${signetAddr}: ${(err as Error).message}`, { cause: err })
	}

	try {
		const response = await new Promise<{ bundle?: Record<string, unknown> }>((resolve, reject) => {
			workload.client.getServiceBundle({ namespace, service }, (err, resp) => {
				if (err) reject(err)
				else resolve(resp)
			})
		})
		const bundle = response.bundle ?? {}
		return {
			towerBaseUrl: requireBundleField(bundle, 'towerBaseUrl', namespace, service),
			keepBaseUrl: requireBundleField(bundle, 'keepBaseUrl', namespace, service),
			internalJwtJwksUrl: requireBundleField(bundle, 'internalJwtJwksUrl', namespace, service),
		}
	} finally {
		workload.close()
	}
}

/**
 * Resolves web's `towerBaseUrl`/`keepBaseUrl`/`internalJwtJwksUrl` per ADR
 * 0102's precedence rule: Env-Only Mode if `SIGNET_ADDR` is unset (today's
 * behavior, unchanged), Signet-Configured Mode -- signet exclusively, fail
 * loud on a missing field, no env fallback -- if it's set. `deps.dial` is
 * injectable so tests can fake the signet dial/bundle fetch without a real
 * SPIFFE workload socket; production callers should omit it and get the
 * real `dialWorkload`.
 */
export async function loadConfig(deps: LoadConfigDeps = defaultDeps): Promise<WebConfig> {
	const signetAddr = deps.env.SIGNET_ADDR
	if (!signetAddr) return loadFromEnv(deps.env)
	return loadFromSignet(signetAddr, deps)
}

// ADR 0102 / Story 006: steward's Env-Only/Signet-Configured gate for its
// plain config URL (`towerUrl`). Steward is one of the four services ADR
// 0102 keeps Env-Only Mode legitimate for (chronicle, lookout, steward,
// web) -- unlike keep/herald/tower, which require signet unconditionally,
// steward must keep working with zero signet wiring when SIGNET_ADDR isn't
// set at all.
//
// Modeled on keep's and herald's own `src/server.ts` (dialWorkload ->
// getServiceBundle, once, before the process starts serving requests),
// adapted to SvelteKit's lifecycle: steward has no bespoke entrypoint the
// way those Fastify services do (adapter-node generates `build/index.js`
// from the framework), so `hooks.server.ts`'s `init` hook -- SvelteKit's own
// documented mechanism for one-time async startup work, called once before
// the server accepts requests -- stands in for those services' `main()`
// doing its signet dial before `app.listen()`.
//
// The real dial (`defaultFetchServiceBundle`) needs a live SPIFFE workload
// socket and a real signet server to exercise, so -- consistent with
// keep/herald/tower's own server.ts, none of which carry test coverage for
// the dial itself -- it isn't unit tested here either. What *is* unit
// tested is everything around it: the Env-Only/Signet-Configured gate and
// the fail-loud-on-missing-field behavior, via `resolveStewardEnv`'s
// injectable `fetchServiceBundle` parameter.

import { dialWorkload } from '@bytepunx/signet-client'
import { loadEnv, setSignetOverride, type StewardEnv } from './env.js'

export interface SignetBootstrap {
  address: string
  trustDomain: string
  namespace: string
  service: string
}

function requireEnv(source: NodeJS.ProcessEnv, name: string): string {
  const value = source[name]
  if (!value) {
    throw new Error(
      `missing required environment variable ${name} -- required once SIGNET_ADDR is set (ADR 0102 / steward Story 006)`,
    )
  }
  return value
}

// Signet-Configured Mode is gated purely on SIGNET_ADDR's presence (per
// Story 006) -- once it's set, the other bootstrap coordinates
// (SIGNET_TRUST_DOMAIN, SIGNET_NAMESPACE) become required too, failing
// loud via requireEnv below if missing, same as keep/herald/tower's own
// `main()`.
export function readSignetBootstrap(source: NodeJS.ProcessEnv = process.env): SignetBootstrap | undefined {
  const address = source.SIGNET_ADDR
  if (!address) return undefined

  const trustDomain = requireEnv(source, 'SIGNET_TRUST_DOMAIN')
  const namespace = requireEnv(source, 'SIGNET_NAMESPACE')
  const service = source.SIGNET_SERVICE ?? 'steward'

  return { address, trustDomain, namespace, service }
}

export type FetchServiceBundle = (bootstrap: SignetBootstrap) => Promise<Record<string, unknown>>

// Real dial: fetch-once, no watch/restart-lock here -- unlike keep/herald/
// tower, steward holds no long-lived connections a bundle change would need
// to tear down and re-establish. A future story can add watchBundle-driven
// restart if steward's signet-sourced config needs to pick up mid-life
// changes without an operator-triggered redeploy; today a bundle edit is
// picked up on steward's next natural restart, same as any other config
// change.
export const defaultFetchServiceBundle: FetchServiceBundle = async (bootstrap) => {
  const workload = await dialWorkload({ address: bootstrap.address, trustDomain: bootstrap.trustDomain })
  try {
    const response = await new Promise<{ bundle?: Record<string, unknown>; configVersion: number }>((resolve, reject) => {
      workload.client.getServiceBundle({ namespace: bootstrap.namespace, service: bootstrap.service }, (err, resp) => {
        if (err) reject(err)
        else resolve(resp)
      })
    })
    return response.bundle ?? {}
  } finally {
    workload.close()
  }
}

// Resolves steward's effective env for this process: Env-Only Mode
// (SIGNET_ADDR unset) returns `loadEnv(source)` unchanged; Signet-Configured
// Mode dials signet and sources `towerUrl` from the bundle exclusively --
// TOWER_URL is ignored even if still set (ADR 0102's precedence rule), and a
// bundle missing `towerUrl` fails loud, naming the field, rather than
// falling back to TOWER_URL or a hardcoded default.
export async function resolveStewardEnv(
  source: NodeJS.ProcessEnv = process.env,
  fetchServiceBundle: FetchServiceBundle = defaultFetchServiceBundle,
): Promise<StewardEnv> {
  const bootstrap = readSignetBootstrap(source)
  if (!bootstrap) return loadEnv(source)

  const bundle = await fetchServiceBundle(bootstrap)
  const towerUrl = bundle.towerUrl as string | undefined

  if (!towerUrl) {
    throw new Error(
      'steward is in Signet-Configured Mode (SIGNET_ADDR is set) but its signet bundle is missing required ' +
        `field "towerUrl" -- provision it in the bundle for namespace "${bootstrap.namespace}", service ` +
        `"${bootstrap.service}" (see ADR 0102 / steward Story 006)`,
    )
  }

  return { towerUrl }
}

// Called once at server startup (`hooks.server.ts`'s `init` hook). A no-op
// in Env-Only Mode (nothing to override); in Signet-Configured Mode,
// installs the resolved bundle value as `loadEnv`'s override for the
// lifetime of the process, before any request is served.
export async function initSignetSourcedEnv(
  source: NodeJS.ProcessEnv = process.env,
  fetchServiceBundle: FetchServiceBundle = defaultFetchServiceBundle,
): Promise<void> {
  const bootstrap = readSignetBootstrap(source)
  if (!bootstrap) return
  const env = await resolveStewardEnv(source, fetchServiceBundle)
  setSignetOverride(env)
}

// SvelteKit's server hooks module. `init` is SvelteKit's documented hook
// for one-time async startup work -- called once, before the server starts
// accepting requests, under both `vite dev` and the built adapter-node
// server. Steward has no bespoke entrypoint of its own the way
// keep/herald/tower's Fastify services do (a hand-rolled `main()` that
// dials signet before `app.listen()`); `init` is the SvelteKit-native
// equivalent.
//
// See `signet-config.ts` for the Env-Only/Signet-Configured gate (a no-op
// when SIGNET_ADDR isn't set, preserving today's behavior unchanged) and
// ADR 0102 / Story 006 for the rationale. A rejected dial (missing
// bootstrap coordinates, unreachable signet, a bundle missing `towerUrl`)
// fails `init` and therefore fails server startup loudly, rather than
// deferring the error to the first request.
//
// Once `towerUrl` is known, an https tower gets the trust-bundle fetch from
// `tower-tls.ts` (ADR 0113, I-0001): tower serves its SPIRE SVID, which
// Node's default verification refuses, so `handleFetch` answers every
// `event.fetch` to tower's origin with a fetch that verifies tower against
// the SPIRE trust bundle and trust domain. The routes' tower clients stay as
// they are, and every other request keeps SvelteKit's own fetch. An https
// tower URL without SPIFFE_ENDPOINT_SOCKET fails startup here, naming it.

import type { HandleFetch, ServerInit } from '@sveltejs/kit/hooks'
import { loadEnv } from '#lib/server/env.js'
import { initSignetSourcedEnv } from '#lib/server/signet-config.js'
import { towerFetchFor } from '#lib/server/tower-tls.js'

let tower: { origin: string; fetch: typeof fetch } | undefined

export const init: ServerInit = async () => {
  await initSignetSourcedEnv()
  const { towerUrl } = loadEnv()
  const url = new URL(towerUrl)
  if (url.protocol === 'https:') tower = { origin: url.origin, fetch: await towerFetchFor(towerUrl) }
}

export const handleFetch: HandleFetch = async ({ request, fetch }) =>
  tower && new URL(request.url).origin === tower.origin ? tower.fetch(request) : fetch(request)

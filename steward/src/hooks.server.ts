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

import { initSignetSourcedEnv } from '$lib/server/signet-config.js'

export const init = initSignetSourcedEnv

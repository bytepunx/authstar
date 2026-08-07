import { fileURLToPath } from 'node:url'
import path from 'node:path'
import initialize from 'consequent'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'

// `consequent`'s own actor loader globs for `*_actor.js` specifically
// (confirmed directly against its source, `src/loader.ts`) -- it has no
// awareness of `.ts` files at all, even under `tsx`. Tests run against
// `dist/actors` (compiled by the `pretest` script), the exact same
// artifact the real server entrypoint loads -- not a test-only path.
const actorsPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../dist/actors',
)

// No actorStore/eventStore/searchAdapter passed -- consequent's own
// `initialize()` falls back to its built-in in-memory default adapters
// (confirmed directly against its source, `src/index.ts`/`src/default/*`),
// not a fake we're building ourselves. This is real `consequent` command/
// event/aggregateFrom behavior, just backed by memory instead of Postgres --
// exactly what "end-to-end without external dependencies" needs.
export default async function buildInMemoryConsequent(): Promise<ConsequentApi> {
  return initialize({ actors: actorsPath, logging: { level: 'none' } })
}

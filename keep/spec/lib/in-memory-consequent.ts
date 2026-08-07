import { fileURLToPath } from 'node:url'
import path from 'node:path'
import initialize from 'consequent'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'
import createMemoryAdapters from './memory-adapters.js'

// `consequent`'s own actor loader globs for `*_actor.js` specifically -- no
// awareness of `.ts` files at all, even under `tsx` (confirmed against its
// source, same discovery tower's pilot made). Tests run against
// `dist/actors` (compiled by the `pretest` script), the exact same artifact
// the real server would load.
const actorsPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../dist/actors',
)

// Explicit, freshly-constructed in-memory adapters per call -- *not*
// consequent's own built-in defaults. See memory-adapters.ts for the full
// explanation: consequent's default adapters are module-level singletons
// shared across every `initialize()` call in the process, and its default
// actor store actively resets its id-mapping table on every fresh
// `initialize()` -- silently orphaning any actor of that type a previous
// call created. Real consequent command/event/search behavior either way,
// just genuinely isolated per test instead of accidentally shared.
export default async function buildInMemoryConsequent(): Promise<ConsequentApi> {
  const adapters = createMemoryAdapters()
  return initialize({
    actors: actorsPath,
    actorStore: adapters.actorStore,
    actorCache: adapters.actorCache,
    eventStore: adapters.eventStore,
    eventCache: adapters.eventCache,
    searchAdapter: adapters.searchAdapter,
    logging: { level: 'none' },
  })
}

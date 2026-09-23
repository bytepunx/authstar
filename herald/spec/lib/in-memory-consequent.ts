import { fileURLToPath } from 'node:url'
import path from 'node:path'
import initialize from 'consequent'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'
import createFixedInMemorySearchAdapter from './in-memory-search-adapter.js'

// `consequent`'s own actor loader globs for `*_actor.js` specifically (same
// finding tower's Story 001 pilot made against its source, `src/loader.ts`)
// -- it has no awareness of `.ts` files at all, even under `tsx`. Tests run
// against `dist/actors` (compiled by the `pretest` script), the exact same
// artifact the real server entrypoint loads -- not a test-only path.
const actorsPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../dist/actors',
)

// actorStore/eventStore are left as consequent's own in-memory defaults --
// real command/event replay behavior, no need to reimplement it. Those
// defaults are a module-level singleton shared across every `initialize()`
// call in the process (see spec/lib/unique.ts), which is harmless as long
// as tests never reuse an id across tests, which this suite's convention
// (fresh slugs per test) guarantees.
//
// `searchAdapter` is explicitly NOT left as the default, though -- it has
// a real, confirmed bug (see in-memory-search-adapter.ts's own comment for
// the full repro) that silently drops *other* actors' index entries, which
// unique-per-test ids alone can't work around (the corruption is triggered
// by a *different* test's actor sharing a searched-on field's value, e.g.
// `status: "active"`, not by id reuse). A fresh, correct instance is
// created per `initialize()` call here instead.
export default async function buildInMemoryConsequent(): Promise<ConsequentApi> {
  return initialize({
    actors: actorsPath,
    searchAdapter: createFixedInMemorySearchAdapter(),
    logging: { level: 'none' },
  })
}

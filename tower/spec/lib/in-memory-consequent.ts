import { fileURLToPath } from 'node:url'
import path from 'node:path'
import initialize from 'consequent'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'
import createFixedInMemorySearchAdapter from './in-memory-search-adapter.js'

// `consequent`'s own actor loader globs for `*_actor.js` specifically
// (confirmed directly against its source, `src/loader.ts`) -- it has no
// awareness of `.ts` files at all, even under `tsx`. Tests run against
// `dist/actors` (compiled by the `pretest` script), the exact same
// artifact the real server entrypoint loads -- not a test-only path.
const actorsPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../dist/actors',
)

// actorStore/eventStore are left as consequent's own in-memory defaults --
// real command/event replay behavior, no need to reimplement it.
//
// `searchAdapter` is explicitly NOT left as the default, though -- it has
// a real, confirmed bug (see `in-memory-search-adapter.ts`'s own comment
// for the full repro, found here building `invite-codes.spec.ts` and
// already independently found and fixed in herald's own pilot first) that
// silently drops *other* actors' index entries whenever one shares a
// searched-on field's value with another and then moves off it. A fresh,
// correct instance is created per `initialize()` call here instead of
// reusing consequent's own default (a module-level singleton shared across
// every `initialize()` call in the process), which also means each test
// file gets a genuinely isolated search index as a side benefit.
export default async function buildInMemoryConsequent(): Promise<ConsequentApi> {
  return initialize({ actors: actorsPath, searchAdapter: createFixedInMemorySearchAdapter(), logging: { level: 'none' } })
}

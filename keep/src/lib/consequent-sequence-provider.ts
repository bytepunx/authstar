import type { ConsequentApi } from './consequent-types.js'
import type { EntitlementScope, SequenceProvider } from './entitlement-publisher.js'
import { scopeKey } from './entitlement-publisher.js'
import type { EntitlementSequenceState } from '../actors/entitlement_sequence_actor.js'

// The real, durable `SequenceProvider` (ADR 0031's ordering-defense
// tooling needs sequence numbers to survive a restart, not reset to zero)
// -- backed by `entitlement_sequence_actor.ts`'s own `key = "${tenant}:
// ${scopeKey}"` composite key, computed the same way that actor's own
// header comment describes.
//
// **A real gotcha found building this, worth being explicit about since it
// contradicts an assumption several other actors in this design lean on**:
// `consequent`'s per-actor command queue does NOT, by itself, make
// concurrent `handle()` calls against the same actor id race-free.
// Confirmed directly against `dispatch.js`/`manager.js`, not assumed:
// `handle()` calls `manager.getOrCreate(type, id)` -- a fresh fetch-and-
// replay-events read -- *before* entering the queue; only the subsequent
// `apply()`/`processCommand` step is queued, and it operates on whichever
// already-fetched `instance` object that specific `handle()` call captured.
// Two concurrent `handle()` calls on a brand-new (or any) id can each fetch
// the same pre-write state, each compute the same "next" value, and each
// persist independently -- `storeEvents` in both the in-memory default
// adapter and `consequent-postgres` (checked directly: a plain unconditional
// `INSERT`, no expected-version/optimistic-concurrency check) accepts both
// writes with no conflict, silently losing one increment. Reproduced
// directly in this module's own test (10 concurrent `next()` calls for the
// same key all returning 1) before this comment was written -- not a
// hypothetical.
//
// Fixed here with a plain in-process, per-key promise-chain mutex:
// concurrent `next()` calls for the same key serialize through this
// function before any of them ever reaches `consequent.handle()`, so only
// one fetch-modify-write cycle for a given key is ever in flight within
// this process. That's sufficient for the realistic threat model (one keep
// process handling concurrent HTTP requests for the same tenant/scope) but
// does **not** protect against a genuinely distributed race across
// multiple keep replicas incrementing the same key at the same instant --
// closing that would need real DB-level optimistic concurrency control,
// which `consequent-postgres` doesn't provide at all (see above) and isn't
// invented here. Acceptable for entitlement sequence numbers specifically:
// ADR 0031's own consumer-side gap detection already treats gaps as
// "maybe missed a message, re-fetch full state to be sure," not as a fatal
// error -- a rare cross-replica double-issued number degrades to the same
// tolerated case, not a new failure mode.
export function createConsequentSequenceProvider(consequent: ConsequentApi): SequenceProvider {
  const chains = new Map<string, Promise<unknown>>()

  function runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = chains.get(key) ?? Promise.resolve()
    const run = previous.then(fn, fn)
    chains.set(key, run.then(() => undefined, () => undefined))
    return run
  }

  return {
    next(tenant: string, scope: EntitlementScope): Promise<number> {
      const key = `${tenant}:${scopeKey(scope)}`
      return runExclusive(key, async () => {
        const results = await consequent.handle(key, 'entitlementSequence.increment', {})
        const result = results[0]
        if (!result || result.rejected) {
          throw new Error(`failed to increment entitlement sequence for ${key}`)
        }
        return (result.state as unknown as EntitlementSequenceState).value
      })
    },
  }
}

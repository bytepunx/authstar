// A plain in-process, per-key promise-chain mutex -- closes a real gap
// found building ADR 0047's applications/role-definitions routes:
// `consequent`'s per-actor command queue does NOT, by itself, make
// concurrent `handle()` calls against the same actor id race-free.
// Confirmed directly against `consequent`'s own `dispatch.js`/`manager.js`,
// not assumed: `handle()` calls `manager.getOrCreate(type, id)` -- a fresh
// fetch-and-replay-events read -- *before* entering the queue; only the
// subsequent `apply()`/`processCommand` step is queued, and it operates on
// whichever already-fetched `instance` object that specific `handle()`
// call captured. Two concurrent `handle()` calls on the same id can each
// fetch the same pre-write state, each pass a "does this already exist"
// guard, and each persist independently -- `storeEvents` in both
// `consequent`'s in-memory default adapter and `consequent-postgres`
// (checked directly: a plain unconditional `INSERT`, no expected-version/
// optimistic-concurrency check) accepts both writes with no conflict.
// Reproduced directly (10 concurrent duplicate-slug `tenant.add-application`
// calls, all "succeeded," none rejected) before this module existed --
// not a hypothetical. See `src/actors/tenant_actor.ts`'s and
// `src/actors/role_definition_actor.ts`'s own guard comments, corrected to
// match this finding.
//
// `runExclusive(key, fn)` serializes concurrent calls sharing the same key
// through this process -- sufficient for the realistic threat model (one
// tower replica handling concurrent HTTP requests for the same tenant/
// slug) but does **not** protect against a genuinely distributed race
// across multiple tower replicas creating under the same key at the same
// instant; closing that would need real DB-level optimistic concurrency
// control, which `consequent-postgres` doesn't provide at all and isn't
// invented here -- a documented residual gap, not a silent one.
export function createKeyedMutex() {
  const chains = new Map<string, Promise<unknown>>()

  function runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = chains.get(key) ?? Promise.resolve()
    const run = previous.then(fn, fn)
    chains.set(key, run.then(() => undefined, () => undefined))
    return run
  }

  return { runExclusive }
}

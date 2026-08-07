let counter = 0

// `consequent`'s built-in in-memory default adapters (actorStore/eventStore/
// searchAdapter) are computed *once*, at module-import time, and reused by
// every `initialize()` call in the process (confirmed directly against
// `consequent/dist/index.js`: `const defaults = { actorStore:
// defaultActorStore(), ..., searchAdapter: defaultSearchAdapter() }` sits
// outside the `initialize` function body). A fresh `consequent` variable
// per test (`buildInMemoryConsequent()` in `beforeEach`) does *not* mean
// fresh underlying storage -- every test in a process shares the same
// in-memory state unless adapters are explicitly passed in (as the
// integration tier does with real Postgres). `fetch`-by-id assertions are
// unaffected by this as long as the exact id string is test-unique, but
// any `find()`-based list assertion will silently accumulate data across
// tests that reuse the same tenant slug -- a real bug this pilot's own
// test run caught (list-length/order assertions failing in ways a single-
// test read never would). For flake-identified actors (e.g. `template`)
// the effect is stranger still: the search index's stale id pointer from
// an earlier `initialize()` session doesn't reliably resolve back to real
// state on a fresh session, so a `find()` can return phantom entries stuck
// at all-default state -- which then wrongly satisfy a `tenant === null`
// global-default-template filter (default state's `tenant` is `null`).
// The fix used throughout this test suite: never hardcode a tenant/contact/
// type slug that a `find()` call also filters by -- generate one fresh per
// test instead, so neither real leaked data nor phantom default-state
// entries can ever coincidentally match.
export function uniqueSlug(prefix: string): string {
  counter += 1
  return `${prefix}-${Date.now()}-${counter}`
}

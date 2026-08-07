import initialize from 'consequent'

// `consequent`'s package entry point only exports `initialize` as a default
// export -- its `ConsequentApi` interface lives in `types.ts` but isn't
// re-exported from the package's own entry point (confirmed by reading the
// source directly, same as tower's pilot). Deriving the type from
// `initialize`'s own return signature works regardless of whether that
// changes later.
export type ConsequentApi = Awaited<ReturnType<typeof initialize>>

// `consequent`'s own public type for `find(type, criteria)` declares
// `criteria: Record<string, unknown>` -- a flat field->value object, and
// its *default* in-memory search adapter genuinely treats it that way
// (confirmed against consequent/dist/default/searchAdapter.js). But
// `consequent-postgres`'s real search adapter (dist/search.js, v2.0.3)
// calls `criteria.forEach(...)` -- it actually expects an *array* of such
// objects (OR'd together; fields within one object AND'd), not a bare
// object at all. Passing a flat object straight through works fine against
// the in-memory adapters used by the behavior/e2e tiers and throws
// `criteria.forEach is not a function` the moment it hits real Postgres --
// found only by running the integration tier, not from reading either
// library's public types. Every `consequent.find()` call site in this
// codebase goes through this helper so the one AND-group -> one-element
// array translation happens in exactly one place, matching what
// `consequent-postgres` actually needs at runtime despite what
// `ConsequentApi`'s own declared type says.
export function searchCriteria(fields: Record<string, unknown>): Record<string, unknown> {
  return [fields] as unknown as Record<string, unknown>
}

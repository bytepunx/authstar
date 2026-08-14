import initialize from 'consequent'

// `consequent`'s package entry point only exports `initialize` as a default
// export -- its `ConsequentApi` interface lives in `types.ts` but isn't
// re-exported from the package's own entry point (confirmed by reading the
// source directly, not assumed). Deriving the type from `initialize`'s own
// return signature works regardless of whether that changes later.
export type ConsequentApi = Awaited<ReturnType<typeof initialize>>

// `consequent`'s own public type for `find(type, criteria)` declares
// `criteria: Record<string, unknown>` -- a flat field->value object -- and
// its *default* in-memory search adapter genuinely treats it that way
// (confirmed against consequent/dist/default/searchAdapter.js). But
// `consequent-postgres`'s real search adapter (dist/search.js) calls
// `criteria.forEach(...)` -- it actually expects an *array* of such
// objects (OR'd together; fields within one object AND'd), not a bare
// object at all. Passing a flat object works fine against the in-memory
// adapter every behavior/e2e test uses and throws `criteria.forEach is
// not a function` the moment it hits real Postgres -- a real, previously
// shipped bug in this codebase (every pre-existing `consequent.find()`
// call site passed a bare object), found while building `routes/
// invite-codes.ts`'s own `find()` calls and fixed everywhere at once,
// not just here. Same fix, same reasoning, already applied in `keep`'s
// own `consequent-types.ts` -- confirmed there first, not coincidental.
export function searchCriteria(fields: Record<string, unknown>): Record<string, unknown> {
  return [fields] as unknown as Record<string, unknown>
}

// `scope` is `{ account: string } | { tenant: string }` throughout keep's
// actors (Story 001). consequent's default in-memory search adapter indexes
// field values by using the value itself as a JS object key
// (`searchAdapter.js`'s `addToFieldIndex`) -- fine for scalar fields
// (`tenant`, `status`, `stripePriceId`), but an object value like `scope`
// stringifies to the same `"[object Object]"` key for every record, so
// `find({ scope })` against the in-memory adapter can't distinguish one
// scope from another. Discovered by testing, not documented anywhere in
// consequent's own README. Worked around the same way everywhere in this
// codebase: `find` (or list) by an indexed scalar field (`tenant`) and
// filter the results down to a matching `scope` in application code.

export type Scope = { account: string } | { tenant: string }

export function scopesEqual(a: Scope, b: Scope): boolean {
  if ('account' in a && 'account' in b) return a.account === b.account
  if ('tenant' in a && 'tenant' in b) return a.tenant === b.tenant
  return false
}

export function isValidScope(value: unknown): value is Scope {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  const hasAccount = typeof v.account === 'string' && Object.keys(v).length === 1
  const hasTenant = typeof v.tenant === 'string' && Object.keys(v).length === 1
  return hasAccount || hasTenant
}

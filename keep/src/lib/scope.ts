import type { FastifyReply, FastifyRequest } from 'fastify'

// `scope` is `{ account: string } | { organization: string }` throughout keep's
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

// ADR 0090 added `{organization}`: a subscription shared across one
// organization's seats. It must carry the real id -- a tenant can have many
// organizations, each with its own Stripe subscription.
//
// ADR 0109 retired `{tenant}`: a tenant owns its Stripe account (ADR 0046),
// so it cannot be its own customer, and tower grants nothing to a tenant.
// Keep accepts, stores, and publishes only these two scopes.
export type Scope = { account: string } | { organization: string }

// A scope keep wrote before ADR 0109. Records persisted with it are left
// untouched and listed by `src/report-tenant-scope.ts`; keep never writes it.
export interface RetiredTenantScope {
  tenant: string
}

// The 400 a route answers when a body still sends `{tenant}` as its scope.
export const TENANT_SCOPE_RETIRED = 'scope {tenant} is retired (ADR 0109): give {account} or {organization}'

// Whether a value is the retired `{tenant}` scope.
export function isTenantScope(value: unknown): value is RetiredTenantScope {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.tenant === 'string' && Object.keys(v).length === 1
}

// Whether two stored scopes name the same account or organization. A record
// persisted before ADR 0109 may still hold `{tenant}`, which matches only itself.
export function scopesEqual(a: Scope | RetiredTenantScope, b: Scope | RetiredTenantScope): boolean {
  if ('account' in a && 'account' in b) return a.account === b.account
  if ('organization' in a && 'organization' in b) return a.organization === b.organization
  if ('tenant' in a && 'tenant' in b) return a.tenant === b.tenant
  return false
}

// Whether a value is a scope keep accepts: `{account}` or `{organization}`, with a non-empty id.
export function isValidScope(value: unknown): value is Scope {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (Object.keys(v).length !== 1) return false
  return (typeof v.account === 'string' && v.account !== '') || (typeof v.organization === 'string' && v.organization !== '')
}

// A route's `preValidation` hook: answers 400 with `TENANT_SCOPE_RETIRED` when
// the body's `scope` is `{tenant}`, before the schema's generic `oneOf` error.
export async function refuseTenantScope(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> {
  const body = request.body as { scope?: unknown } | undefined
  if (body && typeof body === 'object' && isTenantScope(body.scope)) {
    return reply.code(400).send({ error: TENANT_SCOPE_RETIRED })
  }
  return undefined
}

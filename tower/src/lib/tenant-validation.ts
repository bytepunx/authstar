import type { FastifyInstance } from 'fastify'
import type { TenantState } from '../actors/tenant_actor.js'
import { searchCriteria } from './consequent-types.js'

// Shared between routes/provisioning.ts and routes/adopt-tenant.ts -- both
// need the exact same slug/domain rules and "is this domain already taken"
// check, and drift between two copies of a uniqueness check is exactly the
// kind of bug that's invisible until two tenants collide on a host.

// ADR 0091: the internal application slug for the reserved admin surface
// stays `_admin` -- only its *host* changes, to `authstar.<tenant.domain>`.
// "authstar" itself becomes a reserved word: no tenant or application may
// use it as a slug, since it's now also a hostname label every tenant's
// admin host shares.
export const RESERVED_WORD = 'authstar'
export const SLUG_PATTERN = /^[a-z0-9-]+$/
export const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/

export async function fetchState<T>(app: FastifyInstance, type: string, id: string): Promise<T | null> {
  const instance = await app.consequent.fetch(type, id)
  return (instance?.state as unknown as T) ?? null
}

export function validateDomain(rawDomain: string): string | { error: string } {
  const domain = rawDomain.toLowerCase()
  if (!DOMAIN_PATTERN.test(domain)) {
    return { error: 'domain must be a valid DNS hostname, e.g. "acme.io"' }
  }
  return domain
}

export async function domainAlreadyTaken(app: FastifyInstance, domain: string, ownSlug: string): Promise<boolean> {
  // Excludes `ownSlug` so a retried request for an already-created tenant
  // with the same domain converges normally.
  const domainHolders = await app.consequent.find('tenant', searchCriteria({ domain }))
  return domainHolders.some((i) => (i.state as unknown as TenantState).slug !== ownSlug)
}

import type { FastifyInstance } from 'fastify'
import type { RoleDefinitionState } from '../actors/role_definition_actor.js'

// Shared by every write path that validates a `roles` array against the
// active roleDefinition catalog at write time (ADR 0047): `routes/
// invites.ts`, `routes/invite-codes.ts`, and `routes/accounts.ts`'s own
// `POST .../roles` (Story 005). Extracted here once a third call site
// needed the identical logic rather than a third copy-paste.

export type Scope = 'tenant' | { application: string }

export function roleDefinitionKey(tenantSlug: string, name: string, scope: Scope): string {
  return scope === 'tenant' ? `${tenantSlug}:${name}` : `${tenantSlug}:${scope.application}:${name}`
}

export async function activeRoleDefinitionExists(app: FastifyInstance, tenantSlug: string, name: string, scope: Scope): Promise<boolean> {
  const instance = await app.consequent.fetch('roleDefinition', roleDefinitionKey(tenantSlug, name, scope))
  const state = instance?.state as unknown as RoleDefinitionState | undefined
  return Boolean(state?.createdAt) && state?.status === 'active'
}

export async function rolesValid(app: FastifyInstance, tenantSlug: string, roles: Array<{ name: string, scope: Scope }> | undefined): Promise<boolean> {
  if (!roles || roles.length === 0) return true
  for (const role of roles) {
    if (!(await activeRoleDefinitionExists(app, tenantSlug, role.name, role.scope))) return false
  }
  return true
}

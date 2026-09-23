import type { FastifyInstance } from 'fastify'
import type { RoleDefinitionState } from '../actors/role_definition_actor.js'

// Shared by every write path that validates a `roles` array against the
// active roleDefinition catalog at write time (ADR 0047): `routes/
// invites.ts`, `routes/invite-codes.ts`, and `routes/accounts.ts`'s own
// `POST .../roles` (Story 005). Extracted here once a third call site
// needed the identical logic rather than a third copy-paste.

export type Scope = 'tenant' | 'organization' | { application: string }

export function roleDefinitionKey(tenantSlug: string, name: string, scope: Scope): string {
  if (scope === 'tenant') return `${tenantSlug}:${name}`
  if (scope === 'organization') return `${tenantSlug}:organization:${name}`
  return `${tenantSlug}:${scope.application}:${name}`
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

// `organizationMembership.roles`/`invite.organizationRole` are flat role
// names, always implicitly `scope: 'organization'` by context -- unlike
// `rolesValid` above, there's no per-role scope object to carry, so this is
// a thin, differently-shaped wrapper around the same catalog check rather
// than a special case inside `rolesValid` itself.
export async function organizationRolesValid(app: FastifyInstance, tenantSlug: string, roles: string[] | undefined): Promise<boolean> {
  if (!roles || roles.length === 0) return true
  for (const name of roles) {
    if (!(await activeRoleDefinitionExists(app, tenantSlug, name, 'organization'))) return false
  }
  return true
}

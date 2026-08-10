import type { RoleGrant } from '../actors/account_actor.js'

// Shared by `/enrich` (ADR 0003) and, later, any other route that reports
// an account's effective roles for a specific application: only
// tenant-scoped grants plus grants scoped to *this* application are ever
// returned -- never a grant scoped to a different application within the
// same tenant (ADR 0017).
export function filterRolesForApplication(roles: RoleGrant[], application: string): string[] {
  return roles
    .filter((r) => r.scope === 'tenant' || (typeof r.scope === 'object' && r.scope.application === application))
    .map((r) => r.name)
}

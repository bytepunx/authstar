// Keep's local, tower-sourced reference cache of applications + active role
// definitions (ADR 0047, confirmed current by ADR 0083 clarifying ADR
// 0046's "genuine limitation" text was resolved one ADR later). Plan
// mapping / trial / coupon writes all validate `grantedRoles` against this
// cache -- one shared validation path, not three separate implementations
// (Story 003/004).
//
// Tenant-scoped and mutable: `upsertApplication`/`upsertRoleDefinition` are
// the live-update surface `role-reference-consumer.ts` (the RabbitMQ
// consumer for tower's `application.*`/`roleDefinition.*` events) and
// `role-reference-backfill.ts` (the startup/periodic catch-up against
// tower's own list endpoints) both call to keep this current. Production
// boots this with an empty seed and lets the consumer/backfill populate it
// live; `createRoleReferenceCache(seed)` also accepts an initial snapshot,
// which is what tests use for a fixed fixture instead of driving the
// consumer/backfill machinery.
//
// A `GrantedRole` is only ever application-scoped in keep's own model
// (`{application, role}`, no tenant-wide variant) -- tower's own tenant-wide
// `roleDefinition`s (`scope: 'tenant'`) describe tower's admin-role model,
// never referenced by a keep `planMapping`/`coupon`/`trial` `grantedRoles`
// entry. So this cache only ever tracks application-scoped role
// definitions; a tenant-wide `roleDefinition` event is a deliberate no-op
// wherever it's consumed (`role-reference-consumer.ts`/
// `role-reference-backfill.ts`), not tracked here at all.

export interface GrantedRole {
  application: string
  role: string
}

export interface RoleReferenceSnapshot {
  // tenant -> application slug -> active role names
  [tenant: string]: { [application: string]: string[] }
}

export interface RoleReferenceCache {
  isValid(tenant: string, role: GrantedRole): boolean
  validateAll(tenant: string, roles: GrantedRole[]): { valid: true } | { valid: false, invalid: GrantedRole[] }
  upsertApplication(tenant: string, slug: string, active: boolean): void
  upsertRoleDefinition(tenant: string, application: string, role: string, active: boolean): void
}

interface TenantTables {
  // application slug -> currently active?
  applications: Map<string, boolean>
  // `${application}:${role}` -> currently active?
  roles: Map<string, boolean>
}

export function createRoleReferenceCache(seed: RoleReferenceSnapshot = {}): RoleReferenceCache {
  const tenants = new Map<string, TenantTables>()

  function tableFor(tenant: string): TenantTables {
    let table = tenants.get(tenant)
    if (!table) {
      table = { applications: new Map(), roles: new Map() }
      tenants.set(tenant, table)
    }
    return table
  }

  for (const [tenant, applications] of Object.entries(seed)) {
    const table = tableFor(tenant)
    for (const [application, roles] of Object.entries(applications)) {
      table.applications.set(application, true)
      for (const role of roles) table.roles.set(`${application}:${role}`, true)
    }
  }

  function upsertApplication(tenant: string, slug: string, active: boolean): void {
    tableFor(tenant).applications.set(slug, active)
  }

  function upsertRoleDefinition(tenant: string, application: string, role: string, active: boolean): void {
    tableFor(tenant).roles.set(`${application}:${role}`, active)
  }

  function isValid(tenant: string, role: GrantedRole): boolean {
    const table = tenants.get(tenant)
    if (!table) return false
    if (table.applications.get(role.application) !== true) return false
    return table.roles.get(`${role.application}:${role.role}`) === true
  }

  function validateAll(tenant: string, roles: GrantedRole[]): { valid: true } | { valid: false, invalid: GrantedRole[] } {
    const invalid = roles.filter((role) => !isValid(tenant, role))
    if (invalid.length > 0) {
      return { valid: false, invalid }
    }
    return { valid: true }
  }

  return { isValid, validateAll, upsertApplication, upsertRoleDefinition }
}

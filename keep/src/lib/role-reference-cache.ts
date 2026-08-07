// Keep's local, tower-sourced reference cache of applications + active role
// definitions (ADR 0047, confirmed current by ADR 0083 clarifying ADR
// 0046's "genuine limitation" text was resolved one ADR later). Plan
// mapping / trial / coupon writes all validate `grantedRoles` against this
// cache -- one shared validation path, not three separate implementations
// (Story 003/004).
//
// The real cache is seeded by a startup backfill against tower and a
// periodic re-run (ADR 0047) -- that tower-polling mechanism is out of
// scope for this pilot slice (no running tower to poll in these tests; see
// TESTING.md). What's implemented here is the validation contract itself,
// against an injectable snapshot -- production wiring swaps in a real
// poller that keeps the snapshot fresh, tests swap in a fixed fixture.

export interface GrantedRole {
  application: string
  role: string
}

export interface RoleReferenceSnapshot {
  // application slug -> set of active role slugs registered on it
  [application: string]: string[]
}

export interface RoleReferenceCache {
  isValid(role: GrantedRole): boolean
  validateAll(roles: GrantedRole[]): { valid: true } | { valid: false, invalid: GrantedRole[] }
}

export function createRoleReferenceCache(snapshot: RoleReferenceSnapshot): RoleReferenceCache {
  function isValid(role: GrantedRole): boolean {
    const roles = snapshot[role.application]
    return Array.isArray(roles) && roles.includes(role.role)
  }

  function validateAll(roles: GrantedRole[]): { valid: true } | { valid: false, invalid: GrantedRole[] } {
    const invalid = roles.filter((role) => !isValid(role))
    if (invalid.length > 0) {
      return { valid: false, invalid }
    }
    return { valid: true }
  }

  return { isValid, validateAll }
}

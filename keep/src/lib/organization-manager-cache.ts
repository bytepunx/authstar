// Keep's local, tower-sourced cache of each organization's current
// `managers[]` list (ADR 0098). `webhooks.ts` reads this synchronously when
// resolving entitlement fan-out for an `{organization}`-scoped subscription
// -- an organization's managers are who actually receive whatever roles the
// subscription's plan mapping grants, not every member (ADR 0090 left that
// choice open; ADR 0098 makes it).
//
// Populated live by `organization-reference-consumer.ts` (tower's
// `organization.manager-added`/`-removed`/`-succeeded` events). Unlike
// `role-reference-cache.ts`, there is deliberately no backfill mechanism
// yet -- see ADR 0098's own "accepted limitation" section for why a fresh
// keep process starts with an empty cache rather than reconciling
// pre-existing organizations on startup.

export interface OrganizationManagerCache {
  get(organizationId: string): string[]
  addManager(organizationId: string, accountId: string): void
  removeManager(organizationId: string, accountId: string): void
}

export function createOrganizationManagerCache(): OrganizationManagerCache {
  const managers = new Map<string, Set<string>>()

  function tableFor(organizationId: string): Set<string> {
    let table = managers.get(organizationId)
    if (!table) {
      table = new Set()
      managers.set(organizationId, table)
    }
    return table
  }

  return {
    get(organizationId) {
      return [...(managers.get(organizationId) ?? [])]
    },
    addManager(organizationId, accountId) {
      tableFor(organizationId).add(accountId)
    },
    removeManager(organizationId, accountId) {
      managers.get(organizationId)?.delete(accountId)
    },
  }
}

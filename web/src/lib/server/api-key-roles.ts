import type { AccountRoleGrant } from './clients/tower'

// design/adrs/0101-api-keys.md. The (embed) API-key creation forms'
// own client-side mirror of tower's `filterRolesForApplication` (`lib/
// roles.ts`) -- used only to decide which roles to show as checkable in the
// creation form and whether to show the form at all (holding
// `api-keys:manage` for this application). Tower's own routes (`requireAppRole`/
// the org manager+role gate) are the real, authoritative enforcement --
// this is a UI convenience, same "a route guard bug here is a broken UI,
// not a security hole" framing every other guard in this app already
// carries (guard.ts's own header comment).
//
// `account.grantedRoles` uses `{name, scope: 'tenant' | {application}}` --
// a tenant-scope grant applies to every application, an application-scope
// grant applies to just the one it names.
export function accountRolesForApplication(grantedRoles: AccountRoleGrant[], applicationSlug: string): string[] {
	return grantedRoles
		.filter((r) => r.scope === 'tenant' || (typeof r.scope === 'object' && r.scope.application === applicationSlug))
		.map((r) => r.name)
}

// `organization.grantedRoles` uses the flatter `{application, role}` shape
// (tower's `organization_actor.ts`) -- no tenant/application-scope union at
// all, so this is a plain filter+map, not the same helper as above.
export function organizationRolesForApplication(grantedRoles: Array<{ application: string; role: string }>, applicationSlug: string): string[] {
	return grantedRoles.filter((r) => r.application === applicationSlug).map((r) => r.role)
}

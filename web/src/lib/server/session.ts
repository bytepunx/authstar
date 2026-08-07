// The authenticated account, as `_admin` sees it -- built from the internal
// JWT's claims (Story 010: sub/idp/identityHash always present; accountId/
// roles/permissions/usage layered on top only on the `Allow` outcome).
export interface Session {
	/** Portcullis's `sub` claim -- the provider-scoped subject, not tower's accountId. */
	sub: string
	accountId: string
	tenantSlug: string
	email: string | null
	roles: string[]
	permissions: string[]
	/**
	 * `"ok"` | `"degraded"` (Story 010). A `degraded` session carries only
	 * baseline identity claims -- no roles/permissions were fabricated, so
	 * `permissions` is always `[]` here. Every route guard in this app treats
	 * `degraded` as "no grants," never as "unknown, let it through."
	 */
	enrichmentStatus: 'ok' | 'degraded'
}

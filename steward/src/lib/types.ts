// Shared shapes between steward's server-side proxy layer (src/lib/server) and
// its UI (src/routes/**/*.svelte). These mirror tower's/herald's own operator
// API response shapes per the design/stories/steward Stories -- steward does
// not invent new fields, only narrows/reuses what tower and herald already
// return.

export interface Tenant {
  slug: string
  name: string
  status: 'active' | 'suspended' | 'deleted'
  seatLimit?: number
  createdAt?: string
  // ADR 0091: not present on tower's GET /operator/tenants list response
  // (routes/operator.ts's own tenantResponse projection doesn't include it)
  // -- only on the single-tenant GET /tenants/:slug (routes/tenants.ts,
  // spreads full state). Optional here for that reason: present on
  // TenantDetailResponse, absent on list rows.
  domain?: string
}

// GET /tenants/:slug (tower's own direct, unauthenticated-by-design route --
// see tower-client.ts's getTenant for why the operator token is sent anyway
// even though this route doesn't check it) -- narrowed to just what steward
// actually displays, not tower's full TenantState.
export interface TenantDetailResponse {
  slug: string
  name: string
  // ADR 0093: null while the tenant is domain-pending -- created but not
  // yet completed via PATCH /tenants/:slug/domain.
  domain: string | null
  status: 'active' | 'suspended' | 'deleted'
}

// Matches tower's real GET /operator/tenants response exactly (routes/
// operator.ts) -- confirmed live against a real tower instance: it returns
// cursor-based pagination (data/nextCursor), not the items/total shape this
// used to declare. That mismatch meant the tenant list page always read
// undefined off a real response and rendered nothing, even when tower had
// real tenants -- steward's own tests never caught it because they mocked
// the (wrong) assumed shape instead of tower's actual one.
export interface TenantListResponse {
  data: Tenant[]
  nextCursor: string | null
}

// ADR 0091: `domain` replaces `adminHost` override -- every tenant now
// requires its own globally-unique domain (tower computes the admin host
// deterministically from it, authstar.<domain>); an operator can no longer
// hand tower an arbitrary host directly.
export interface CreateTenantRequest {
  slug: string
  name: string
  domain: string
  adminEmail: string
}

export interface CreateTenantResponse {
  slug: string
  domain: string
  adminHost: string
}

// tower Story 012: a failed creation reports which step failed and that
// retrying the same slug is the correct recovery -- not a generic message.
export interface CreateTenantErrorBody {
  error: string
  failedStep?: string
}

// Matches tower's real permission-grant shape exactly (accounts.ts's
// `permissionBodySchema` / `account_actor.ts`'s `PermissionGrant`, and
// invites.ts's own `permissionSchema` -- the same shape both places).
// Previously this was wrongly declared as `{application, role}` here,
// which never matched what tower's accounts grant/revoke endpoints
// actually accept or return -- unnoticed because tests mocked the wrong
// shape instead of tower's real one, the same class of bug already fixed
// elsewhere in this file tonight (TenantListResponse, AccountListResponse).
export interface PermissionGrant {
  grant: string
  scope: 'tenant' | { application: string }
  maxOutstanding: number | null
}

export interface Account {
  id: string
  email?: string
  permissions: PermissionGrant[]
}

// Matches tower's real GET /operator/tenants/:slug/accounts response
// exactly (routes/accounts.ts's listAccounts): a bare array, no wrapper --
// same class of bug as TenantListResponse (see its own comment above): the
// old {items:[...]} shape meant this always read undefined off a real
// response, surfacing as "Failed to load admin access" on the tenant
// detail page even for a tenant with real accounts.
export type AccountListResponse = Account[]

export interface InviteRequest {
  email: string
  application: string | null
  permissions: PermissionGrant[]
}

export interface InviteResponse {
  id: string
  email: string
  expiresAt?: string
}

export type TenantRotationKey = 'session' | 'internal' | 'identity-hash'
export type HeraldRotationKey = 'payload-encryption' | 'unsubscribe-signing'

export interface RotateTenantKeysRequest {
  keys: TenantRotationKey[]
}

// Matches tower's actual response shape (tower/src/routes/rotate-keys.ts)
// -- each rotated key reports its own new generation, and rotation is
// per-key independent, so a partial failure (one key rotated, another
// failed) is a real, representable outcome, not just success-or-nothing.
export interface RotatedKeyGeneration {
  key: TenantRotationKey
  version: number
  effectiveFrom: string
}

export interface TenantKeyRotationFailure {
  key: TenantRotationKey
  error: string
}

export interface RotateTenantKeysResponse {
  rotated: RotatedKeyGeneration[]
  failed: TenantKeyRotationFailure[]
}

export interface RotateHeraldKeysRequest {
  keys: HeraldRotationKey[]
}

export interface RotateHeraldKeysResponse {
  rotated: HeraldRotationKey[]
}

export interface ActivityEntry {
  timestamp: string
  actorType: string
  actorId: string
  eventType: string
  summary: string
  actingAs?: string | null
}

export interface ActivityListResponse {
  items: ActivityEntry[]
}

export interface StuckErasureRequest {
  tenant: string
  contactId: string
  requestedAt: string
  expectedServices: string[]
  missingServices: string[]
}

export interface StuckErasureRequestsResponse {
  items: StuckErasureRequest[]
}

export interface OidcProvider {
  name: string
  discoveryUrl: string
  clientId: string
  scope: string[]
  discoveryStatus?: {
    healthy: boolean
    checkedAt: string
  }
}

export interface ProviderListResponse {
  items: OidcProvider[]
}

// The connect-time confirmation result (Story 001). Tower has no dedicated
// "identity/version" route specified yet in its own Stories (confirmed
// against design/stories/tower/*.md and ADR 0045/0048 -- both describe the
// *requirement* to surface installation/environment info but neither names a
// concrete route or field). Steward's own judgment call, documented in
// TESTING.md: treat the configured tower base URL itself as the
// "environment" identifier, and layer on whatever tower's confirmation
// response is willing to tell us (tenant count as a weak liveness signal),
// rather than inventing and depending on an unspecified tower contract.
export interface ConnectResult {
  ok: boolean
  towerUrl?: string
  reason?: 'invalid-token' | 'unreachable' | 'unknown'
  message?: string
}

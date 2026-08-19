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

export interface CreateTenantRequest {
  slug: string
  name: string
  adminEmail: string
  adminHost?: string
}

export interface CreateTenantResponse {
  slug: string
  adminHost: string
}

// tower Story 012: a failed creation reports which step failed and that
// retrying the same slug is the correct recovery -- not a generic message.
export interface CreateTenantErrorBody {
  error: string
  failedStep?: string
}

export interface PermissionGrant {
  application: string | null
  role: string
}

export interface Account {
  id: string
  email?: string
  permissions: PermissionGrant[]
}

export interface AccountListResponse {
  items: Account[]
}

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

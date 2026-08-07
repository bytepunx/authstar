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

export interface TenantListResponse {
  items: Tenant[]
  total: number
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

export interface RotateTenantKeysResponse {
  rotated: TenantRotationKey[]
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
  tenantCount?: number
  reason?: 'invalid-token' | 'unreachable' | 'unknown'
  message?: string
}

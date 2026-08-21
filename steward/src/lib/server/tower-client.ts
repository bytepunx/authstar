// Steward's proxy client for tower's operator API tree. Every function here
// maps directly onto a route named in design/stories/tower/013-operator-api.md
// (and 010/011/012 which 013 reuses unchanged) -- steward invents nothing new
// backend-side, only calls what those Stories already specify.

import { backendRequest, type BackendResult, type FetchLike } from './backend-client.js'
import type {
  Account,
  AccountListResponse,
  ActivityListResponse,
  CreateRoleDefinitionRequest,
  CreateTenantRequest,
  CreateTenantResponse,
  InviteRequest,
  InviteResponse,
  PermissionGrant,
  RoleDefinition,
  RoleDefinitionListResponse,
  RoleDefinitionScope,
  RotateTenantKeysRequest,
  RotateTenantKeysResponse,
  StuckErasureRequestsResponse,
  Tenant,
  TenantDetailResponse,
  TenantListResponse,
} from '../types.js'

export interface TowerClientOptions {
  baseUrl: string
  fetchImpl?: FetchLike
}

export function createTowerClient({ baseUrl, fetchImpl = fetch }: TowerClientOptions) {
  const call = <T>(opts: Parameters<typeof backendRequest<T>>[2]) => backendRequest<T>(fetchImpl, baseUrl, opts)

  return {
    // Story 001: the lightweight token-confirmation call, `limit=1` so it's
    // cheap regardless of how many tenants the installation has. Was `limit:
    // 0` -- confirmed live against a real tower instance: its own
    // querystring schema (routes/operator.ts) requires `minimum: 1`, so the
    // "cheaper" limit=0 always 400'd instead, meaning no token ever
    // confirmed successfully. 1 is still cheap; the response body's data is
    // never used here, only whether the call itself succeeded.
    confirmToken(token: string): Promise<BackendResult<TenantListResponse>> {
      return call<TenantListResponse>({ path: '/operator/tenants', token, query: { limit: 1 } })
    },

    // Story 002 / tower Story 013: paginated, searchable by slug/name.
    listTenants(
      token: string,
      params: { search?: string; limit?: number; offset?: number } = {},
    ): Promise<BackendResult<TenantListResponse>> {
      return call<TenantListResponse>({
        path: '/operator/tenants',
        token,
        query: { search: params.search, limit: params.limit, offset: params.offset },
      })
    },

    // Story 002 / tower Story 011: `PATCH /operator/tenants/{slug}`, the one
    // path back for a self-suspended tenant.
    reactivateTenant(token: string, actorLabel: string, slug: string): Promise<BackendResult<Tenant>> {
      return call<Tenant>({
        method: 'PATCH',
        path: `/operator/tenants/${encodeURIComponent(slug)}`,
        token,
        actorLabel,
        body: { status: 'active' },
      })
    },

    suspendTenant(token: string, actorLabel: string, slug: string): Promise<BackendResult<Tenant>> {
      return call<Tenant>({
        method: 'PATCH',
        path: `/operator/tenants/${encodeURIComponent(slug)}`,
        token,
        actorLabel,
        body: { status: 'suspended' },
      })
    },

    // Story 002 / tower Story 012: `POST /tenants`, standalone ingress (not
    // the operator tree), but still takes the operator bearer token.
    createTenant(token: string, body: CreateTenantRequest): Promise<BackendResult<CreateTenantResponse>> {
      return call<CreateTenantResponse>({ method: 'POST', path: '/tenants', token, body })
    },

    // ADR 0091: `GET /tenants/:slug` -- tower's own direct route (routes/
    // tenants.ts), not on the operator tree at all (no operator-tree
    // single-tenant GET exists). Doesn't check auth (no preHandler on that
    // route), so the operator token sent here is inert, not required --
    // kept for consistency with every other call this client makes. Used
    // to surface a tenant's `domain` (and therefore its authstar.<domain>
    // admin URL) on the detail page, which the list response doesn't carry.
    getTenant(token: string, slug: string): Promise<BackendResult<TenantDetailResponse>> {
      return call<TenantDetailResponse>({ path: `/tenants/${encodeURIComponent(slug)}`, token })
    },

    // Story 003 Admin Access -- read + email search share one route.
    listAccounts(
      token: string,
      tenantSlug: string,
      params: { email?: string } = {},
    ): Promise<BackendResult<AccountListResponse>> {
      return call<AccountListResponse>({
        path: `/operator/tenants/${encodeURIComponent(tenantSlug)}/accounts`,
        token,
        query: { email: params.email },
      })
    },

    grantPermission(
      token: string,
      actorLabel: string,
      tenantSlug: string,
      accountId: string,
      grant: PermissionGrant,
    ): Promise<BackendResult<Account>> {
      return call<Account>({
        method: 'POST',
        path: `/operator/tenants/${encodeURIComponent(tenantSlug)}/accounts/${encodeURIComponent(accountId)}/permissions`,
        token,
        actorLabel,
        body: grant,
      })
    },

    revokePermission(
      token: string,
      actorLabel: string,
      tenantSlug: string,
      accountId: string,
      grant: string,
      // tower's real DELETE contract (routes/accounts.ts's
      // removalQuerySchema) reads scope from the query string, not the URL
      // path -- `scope: 'tenant'` or `applicationScope: '<slug>'`, never
      // both.
      scopeQuery: { scope?: 'tenant', applicationScope?: string },
    ): Promise<BackendResult<Account>> {
      return call<Account>({
        method: 'DELETE',
        path: `/operator/tenants/${encodeURIComponent(tenantSlug)}/accounts/${encodeURIComponent(accountId)}/permissions/${encodeURIComponent(grant)}`,
        token,
        actorLabel,
        query: scopeQuery,
      })
    },

    // Story 003 bootstrap path -- elevated invite.
    createInvite(
      token: string,
      actorLabel: string,
      tenantSlug: string,
      body: InviteRequest,
    ): Promise<BackendResult<InviteResponse>> {
      return call<InviteResponse>({
        method: 'POST',
        path: `/operator/tenants/${encodeURIComponent(tenantSlug)}/invites`,
        token,
        actorLabel,
        body,
      })
    },

    // Role definition management (authstar-steward#1). NOTE: as of this
    // writing, tower's role-definitions.ts registers only the tenant-scoped
    // (permission-gated) tree, not an /operator/... equivalent -- unlike
    // accounts.ts/invites.ts, which register both per ADR 0030's "operator
    // tree wraps the same handlers, different auth middleware" pattern.
    // These calls are written against the operator path tower *should*
    // expose (matching every other proxy in this file) but will 404 until
    // tower adds it.
    listRoleDefinitions(
      token: string,
      tenantSlug: string,
      params: { status?: 'active' | 'retired'; scope?: string } = {},
    ): Promise<BackendResult<RoleDefinitionListResponse>> {
      return call<RoleDefinitionListResponse>({
        path: `/operator/tenants/${encodeURIComponent(tenantSlug)}/role-definitions`,
        token,
        query: { status: params.status, scope: params.scope },
      })
    },

    createRoleDefinition(
      token: string,
      actorLabel: string,
      tenantSlug: string,
      body: CreateRoleDefinitionRequest,
    ): Promise<BackendResult<RoleDefinition>> {
      return call<RoleDefinition>({
        method: 'POST',
        path: `/operator/tenants/${encodeURIComponent(tenantSlug)}/role-definitions`,
        token,
        actorLabel,
        body,
      })
    },

    retireRoleDefinition(
      token: string,
      actorLabel: string,
      tenantSlug: string,
      name: string,
      scope: RoleDefinitionScope,
    ): Promise<BackendResult<RoleDefinition>> {
      // Tower's toResponse (role-definitions.ts) never returns an `id` --
      // the actor's own composite key (tenant:name or
      // tenant:application:name, see that file's keyFor) *is* the id the
      // DELETE route's :id param expects, computed the same way here.
      const id = scope === 'tenant' ? `${tenantSlug}:${name}` : `${tenantSlug}:${scope.application}:${name}`
      return call<RoleDefinition>({
        method: 'DELETE',
        path: `/operator/tenants/${encodeURIComponent(tenantSlug)}/role-definitions/${encodeURIComponent(id)}`,
        token,
        actorLabel,
      })
    },

    // Story 004 -- activity feed, operator-scoped.
    getActivity(
      token: string,
      tenantSlug: string,
      params: { sinceEventId?: string; until?: string } = {},
    ): Promise<BackendResult<ActivityListResponse>> {
      return call<ActivityListResponse>({
        path: `/operator/tenants/${encodeURIComponent(tenantSlug)}/activity`,
        token,
        query: { sinceEventId: params.sinceEventId, until: params.until },
      })
    },

    // Story 004 -- stuck erasure requests, cross-tenant.
    getStuckErasureRequests(token: string, olderThanHours: number): Promise<BackendResult<StuckErasureRequestsResponse>> {
      return call<StuckErasureRequestsResponse>({
        path: '/operator/erasure-requests/stuck',
        token,
        query: { olderThanHours },
      })
    },

    // Story 005 -- tenant key rotation.
    rotateTenantKeys(
      token: string,
      actorLabel: string,
      tenantSlug: string,
      body: RotateTenantKeysRequest,
    ): Promise<BackendResult<RotateTenantKeysResponse>> {
      return call<RotateTenantKeysResponse>({
        method: 'POST',
        path: `/operator/tenants/${encodeURIComponent(tenantSlug)}/rotate-keys`,
        token,
        actorLabel,
        body,
      })
    },
  }
}

export type TowerClient = ReturnType<typeof createTowerClient>

# ADR 0041: Keep's HTTP API Surface

- **Status:** Accepted (corrected by [ADR 0046](0046-tenant-owned-stripe-configuration.md))
- **Date:** 2026-07-29
- **Affects:** keep, portcullis, web

> **Correction (2026-07-30):** there is still nothing for a tenant to "connect" (no Connect
> OAuth, no `merchantAccount` — that stays removed), so the "Customer" route group below is
> unaffected. But two things below are now stale per
> [ADR 0046](0046-tenant-owned-stripe-configuration.md): **Plan mappings** reverts to fully
> tenant-scoped (writes included — the operator-only restriction added by ADR 0045 is reversed),
> and the **Stripe webhook receiver** moves from a direct keep-owned ingress to a portcullis
> reserved path, since it's tenant-scoped again. Both sections below are updated to reflect this.

## Decision

### Auth model — same as tower/herald/chronicle; "web reaches keep directly" means bypassing tower, not portcullis

ADR 0018's "keep is reached through web, never through tower" is about keep never being
proxied through tower's API — it still sits behind portcullis as another prefix-routed
upstream, the same pattern as every other backend service, authorized via `permissions` claims
on the portcullis-forwarded internal JWT, independently verified. Worth stating explicitly
since "directly" could otherwise be misread as bypassing portcullis too.

### Route inventory

**Stripe configuration** (added by [ADR 0052](0052-keep-herald-own-signet-access.md))

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/stripe-config` | `GET`, `PATCH` | `GET` never returns the secret key/webhook secret (write-only). `PATCH` sets/rotates them; keep pushes to its own signet bundle directly. Gated by `billing:manage` |

**Customer** (ADR 0042 — replaces the removed merchant-account group)

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/customer` | `GET` | Tenant-scoped customer record (`scope: {tenant}`) |
| `/tenants/{tenantSlug}/accounts/{accountId}/customer` | `GET` | Account-scoped customer record (`scope: {account}`, B2C) |

Read-only through this API, same reasoning as **Subscriptions** below — a `customer` record is
created automatically the first time a checkout session completes (Stripe webhook-driven, ADR
0042), never explicitly by an admin call.

**Plan mappings** (ADR 0038, restored by [ADR 0046](0046-tenant-owned-stripe-configuration.md))
— fully tenant-scoped again, including writes. Plans are tenant-defined (each tenant owns its
own Stripe account per ADR 0046) — a tenant admin's own `permissions` gate reading and writing
their own plan mappings, no operator involvement. (ADR 0045's operator-only restriction was
correct only under ADR 0042's now-superseded premise and is reversed.) **Writes are validated**
against keep's locally-materialized, tower-sourced reference cache of known applications and
role definitions ([ADR 0047](0047-application-and-role-slug-validation.md)) — a `grantedRoles`
entry referencing an unknown application or unregistered role name is rejected, not silently
accepted as an inert grant.

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/plan-mappings` | `GET`, `POST` | |
| `/tenants/{tenantSlug}/plan-mappings/{id}` | `GET`, `PATCH`, `DELETE` | `planMapping` gains `status: "active" \| "retired"` ([ADR 0053](0053-lifecycle-status-consolidation.md)) — a real removal would break renewal processing for existing subscribers on a retired plan. `DELETE` is an alias for `PATCH { status: "retired" }`; keep's own webhook lookup must still find and honor retired mappings, only the admin create/upgrade flow filters to `active`. Also gains cached `unitAmount`/`currency`/`interval`, synced from Stripe ([ADR 0060](0060-activity-feed-and-revenue-summary.md)) |

**Activity and revenue** (added by [ADR 0060](0060-activity-feed-and-revenue-summary.md))

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/activity` | `GET` | Same shared shape as tower's/herald's own activity routes. Gated by `activity:read` |
| `/tenants/{tenantSlug}/revenue-summary` | `GET` | MRR, active-subscription counts by status/plan. Gated by `billing:read`, distinct from `billing:manage` |

**Checkout**

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/checkout-sessions` | `POST` | Creates a Stripe Checkout Session for a given plan mapping, returns the redirect URL — the mechanism an "upgrade" flow actually uses |

**Subscriptions** (ADR 0038) — read-only through this API; state changes are webhook-driven

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/subscriptions` | `GET` | |
| `/tenants/{tenantSlug}/subscriptions/{id}` | `GET` | |

**Self-service** (added by [ADR 0071](0071-self-service-widget-data-access.md)) — identity
resolved entirely from the forwarded internal JWT, no `{tenantSlug}`/`{accountId}` segments

| Route | Method | Notes |
|---|---|---|
| `/me/subscription` | `GET` | `{ status, planName, currentPeriodEnd }` for the caller's own account-scoped `subscription`; `planName` resolved server-side from `planMapping`. Reached via portcullis's `/_authstar/me/subscription` (Story 025) |

**Trials** (ADR 0039)

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/trials` | `GET`, `POST` | |
| `/tenants/{tenantSlug}/trials/{id}` | `GET`, `PATCH`, `DELETE` | `PATCH { expiresAt }` extends — appends to the `extensions` audit trail (ADR 0039), same convention as every other state change in this design. `DELETE` is an alias for `PATCH { status: "expired" }` — revoke is immediate expiration ([ADR 0053](0053-lifecycle-status-consolidation.md)) |

**Coupons** (ADR 0039)

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/coupons` | `GET`, `POST` | |
| `/tenants/{tenantSlug}/coupons/{code}` | `GET`, `PATCH`, `DELETE` | `PATCH { status: "revoked" }` is the actual mechanism; `DELETE` is an alias ([ADR 0053](0053-lifecycle-status-consolidation.md)) |

**Usage records** (ADR 0043)

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/usage-records` | `GET`, `POST` | `GET` is paginated, filterable by `meter`/`application`/date range — the `web` admin view. `POST` is what portcullis's `/_authstar/usage` route (Story 021) actually calls; body carries `application`, `accountId`, `meter`, `quantity`, plus portcullis-attached identity/role context. Idempotency is expressed via the `Idempotency-Key` header (ADR 0030's convention for this API), even though the app-facing contract at the portcullis layer (ADR 0043) carries `idempotencyKey` in its body for simplicity — portcullis translates one into the other when it proxies the call |
| `/tenants/{tenantSlug}/usage-records/{id}` | `GET` | |

A dedicated current-period summary endpoint (totals per meter, rather than a raw list) is a
plausible future addition, following the same purpose-built-report pattern `chronicle` already
established (ADR 0036) — not added here since `web` hasn't asked for it yet.

### Stripe webhook receiver: a portcullis reserved path, per tenant

**Revised by [ADR 0046](0046-tenant-owned-stripe-configuration.md).** Each tenant now has its
own Stripe account (ADR 0046) and therefore its own webhook, tied to that tenant's own domain —
the "no platform-level hostname exists" objection that previously ruled portcullis out no
longer applies, since this is tenant-scoped like everything else. `POST
/_authstar/webhooks/stripe` is a reserved portcullis path (registered against the tenant's
`_admin` application's host specifically — stable, always present, per ADR 0044 — rather than a
product domain that could change), resolved via normal `Host`-based tenant/application
resolution (Story 013) and proxied straight to `keep` with no session/JWT check of its own —
Stripe's own webhook signature (verified by `keep` against
`tenant-<slug>-stripe-webhook-secret`) is the actual authentication, unchanged in substance from
before, just relocated.

## Consequences

- Keep's fastify routes follow the same schema-first, swagger-generated approach as tower/
  herald.
- A new portcullis story is needed for the `/_authstar/webhooks/stripe` reserved pass-through
  route (written alongside ADR 0046).

## Related

- [ADR 0018](0018-trial-roles-and-keep-boundary.md), [ADR 0030](0030-tower-api-surface.md), [ADR 0034](0034-herald-api-surface.md), [ADR 0035](0035-lookout-and-chronicle-analytics.md), [ADR 0037](0037-stripe-connect-tenant-owned-merchant-accounts.md), [ADR 0038](0038-plan-mapping-and-subscription-tracking.md), [ADR 0039](0039-keep-trials-and-coupons.md), [ADR 0043](0043-application-reported-usage-metering.md), [ADR 0046](0046-tenant-owned-stripe-configuration.md), [ADR 0052](0052-keep-herald-own-signet-access.md), [ADR 0053](0053-lifecycle-status-consolidation.md), [ADR 0071](0071-self-service-widget-data-access.md) (`/me/subscription`)

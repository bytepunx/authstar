# ADR 0041: Keep's HTTP API Surface

- **Status:** Accepted (corrected by [ADR 0042](0042-single-account-billing-model.md))
- **Date:** 2026-07-29
- **Affects:** keep, portcullis, web

> **Correction (2026-07-29, filled in 2026-07-30):** the entire "Merchant account" route group
> below (Connect OAuth onboarding) is removed per [ADR 0042](0042-single-account-billing-model.md)
> — there is nothing for a tenant to "connect" under the single-account model. Replaced below by
> a `customer` read route and the usage-record routes ([ADR 0043](0043-application-reported-usage-metering.md)).
> Every other route group (plan mappings, checkout, subscriptions, trials, coupons) is
> unaffected.

## Decision

### Auth model — same as tower/herald/chronicle; "web reaches keep directly" means bypassing tower, not portcullis

ADR 0018's "keep is reached through web, never through tower" is about keep never being
proxied through tower's API — it still sits behind portcullis as another prefix-routed
upstream, the same pattern as every other backend service, authorized via `permissions` claims
on the portcullis-forwarded internal JWT, independently verified. Worth stating explicitly
since "directly" could otherwise be misread as bypassing portcullis too.

### Route inventory

**Customer** (ADR 0042 — replaces the removed merchant-account group)

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/customer` | `GET` | Tenant-scoped customer record (`scope: {tenant}`) |
| `/tenants/{tenantSlug}/accounts/{accountId}/customer` | `GET` | Account-scoped customer record (`scope: {account}`, B2C) |

Read-only through this API, same reasoning as **Subscriptions** below — a `customer` record is
created automatically the first time a checkout session completes (Stripe webhook-driven, ADR
0042), never explicitly by an admin call.

**Plan mappings** (ADR 0038)

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/plan-mappings` | `GET`, `POST` | |
| `/tenants/{tenantSlug}/plan-mappings/{id}` | `GET`, `PATCH`, `DELETE` | |

**Checkout**

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/checkout-sessions` | `POST` | Creates a Stripe Checkout Session for a given plan mapping, returns the redirect URL — the mechanism an "upgrade" flow actually uses |

**Subscriptions** (ADR 0038) — read-only through this API; state changes are webhook-driven

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/subscriptions` | `GET` | |
| `/tenants/{tenantSlug}/subscriptions/{id}` | `GET` | |

**Trials** (ADR 0039)

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/trials` | `GET`, `POST` | |
| `/tenants/{tenantSlug}/trials/{id}` | `GET`, `PATCH`, `DELETE` | `PATCH { expiresAt }` extends — appends to the `extensions` audit trail (ADR 0039), same convention as every other state change in this design |

**Coupons** (ADR 0039)

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/coupons` | `GET`, `POST` | |
| `/tenants/{tenantSlug}/coupons/{code}` | `GET`, `DELETE` | `DELETE` = revoke |

**Usage records** (ADR 0043)

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/usage-records` | `GET`, `POST` | `GET` is paginated, filterable by `meter`/`application`/date range — the `web` admin view. `POST` is what portcullis's `/_authstar/usage` route (Story 021) actually calls; body carries `application`, `accountId`, `meter`, `quantity`, plus portcullis-attached identity/role context. Idempotency is expressed via the `Idempotency-Key` header (ADR 0030's convention for this API), even though the app-facing contract at the portcullis layer (ADR 0043) carries `idempotencyKey` in its body for simplicity — portcullis translates one into the other when it proxies the call |
| `/tenants/{tenantSlug}/usage-records/{id}` | `GET` | |

A dedicated current-period summary endpoint (totals per meter, rather than a raw list) is a
plausible future addition, following the same purpose-built-report pattern `chronicle` already
established (ADR 0036) — not added here since `web` hasn't asked for it yet.

### Stripe webhook receiver: a direct, keep-owned ingress — not through portcullis

Resolved (was open in the prior version of this ADR). Portcullis's request handling starts with
`Host`-based tenant/application resolution (Story 013) — a request matching no application
`404`s before anything else runs. There is no notion of a "platform-level" hostname in
portcullis's model today. Stripe's webhook is genuinely installation-level, tied to no tenant's
domain — forcing it through portcullis would mean inventing a new virtual-host concept solely
for this one endpoint. Instead, keep exposes its own direct ingress (own Kubernetes Service/
Ingress, TLS via cert-manager — the same pattern already used for RabbitMQ's listener, ADR
0008, which similarly sits outside portcullis's routing model), registered with Stripe as its
own URL. Authentication is Stripe's webhook signature (a signet-managed secret, same as every
other secret in this design) — this was always the actual security boundary regardless of
routing topology, per the original open question's own framing.

## Consequences

- Keep's fastify routes follow the same schema-first, swagger-generated approach as tower/
  herald.
- Keep needs its own direct ingress (separate from portcullis) for the Stripe webhook receiver.

## Related

- [ADR 0018](0018-trial-roles-and-keep-boundary.md), [ADR 0030](0030-tower-api-surface.md), [ADR 0034](0034-herald-api-surface.md), [ADR 0035](0035-lookout-and-chronicle-analytics.md), [ADR 0037](0037-stripe-connect-tenant-owned-merchant-accounts.md), [ADR 0038](0038-plan-mapping-and-subscription-tracking.md), [ADR 0039](0039-keep-trials-and-coupons.md), [ADR 0042](0042-single-account-billing-model.md), [ADR 0043](0043-application-reported-usage-metering.md)

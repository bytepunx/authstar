# ADR 0041: Keep's HTTP API Surface

- **Status:** Accepted (corrected by [ADR 0042](0042-single-account-billing-model.md))
- **Date:** 2026-07-29
- **Affects:** keep, portcullis, web

> **Correction (2026-07-29):** the entire "Merchant account" route group below (Connect OAuth
> onboarding) is removed per [ADR 0042](0042-single-account-billing-model.md) — there is
> nothing for a tenant to "connect" under the single-account model. A `customer` read route and
> a usage-reporting route are needed in its place; not laid out here, left for a follow-up pass.
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

**Merchant account** (ADR 0037 — Stripe Connect onboarding)

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/merchant-account` | `GET`, `DELETE` | Status; `DELETE` disconnects |
| `/tenants/{tenantSlug}/merchant-account/connect` | `GET` | Initiates the Stripe Connect OAuth redirect |
| `/tenants/{tenantSlug}/merchant-account/connect/callback` | `GET` | Stripe's OAuth callback — validated via the same state-cookie pattern already established for portcullis's own OAuth flow (Story 005/006), not a fresh permission check at the callback moment |

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

### Open question: where does the Stripe webhook receiver actually live?

Not resolved here. Everything else in this inventory is tenant-scoped and fits portcullis's
`Host`-based application routing naturally. The Stripe webhook endpoint (ADR 0037) is different
in kind — it's a single **platform-level** URL registered once with Stripe, covering events
across every tenant's connected account, not addressed to any one tenant's domain. Two real
options: (a) route it through portcullis anyway as a new reserved, non-tenant-scoped path
(the same category `/_authstar/*` already is for analytics, ADR 0035, just without a tenant in
the URL at all), keeping portcullis the single ingress point for everything; or (b) expose it
as a direct, keep-owned ingress separate from portcullis, since it doesn't conceptually belong
to the tenant-routing model at all. Signature verification (a Stripe-issued webhook secret,
signet-managed like every other secret in this design) is the actual authentication either way
— this is a routing-topology question, not a security one.

## Consequences

- Keep's fastify routes follow the same schema-first, swagger-generated approach as tower/
  herald.
- The webhook-routing question needs an answer before implementation, though it doesn't block
  any of the rest of this design.

## Related

- [ADR 0018](0018-trial-roles-and-keep-boundary.md), [ADR 0030](0030-tower-api-surface.md), [ADR 0034](0034-herald-api-surface.md), [ADR 0035](0035-lookout-and-chronicle-analytics.md) (the `/_authstar/*` reserved-path precedent), [ADR 0037](0037-stripe-connect-tenant-owned-merchant-accounts.md), [ADR 0038](0038-plan-mapping-and-subscription-tracking.md), [ADR 0039](0039-keep-trials-and-coupons.md)

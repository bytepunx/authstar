# Story 007 — Permission Enforcement Middleware

**Epic:** Authorization
**Repo:** keep
**Status:** Draft
**New — every prior keep story assumes this exists and none of them specify it.** Per
[ADR 0041](../../decisions/0041-keep-api-surface.md),
[ADR 0046](../../decisions/0046-tenant-owned-stripe-configuration.md),
[ADR 0051](../../decisions/0051-web-applications-and-identity-access-screens.md),
[ADR 0060](../../decisions/0060-activity-feed-and-revenue-summary.md).
**Depends on:** [tower Story 014](../tower/014-permission-enforcement-middleware.md) — same
mechanism, same open prerequisite question (tenant-JWKS resolution for a non-Host-routed
backend service), not re-derived here.

---

## The gap this closes

Every one of keep's own stories (003 through 006) opens its write and several of its read
routes with "gated by `billing:manage`"/`billing:read`/`activity:read`/`applications:manage` —
but `jose` is a listed dependency never imported anywhere in `src/`, and no route in this repo
currently checks anything. Unlike tower, keep's own `TESTING.md` doesn't even name this as a
known, deliberately-deferred gap — worth fixing alongside the code, not just the code.

---

## Mechanism

Identical to [tower Story 014](../tower/014-permission-enforcement-middleware.md)'s — same
`@bytepunx/authstar-fastify`-backed `preHandler`, same treatment of `enrichmentStatus:
"degraded"` as no-permissions, same generic-403-on-failure posture. Not re-specified here beyond
one keep-specific point:

- [ ] Keep has no self-service self-action exemption equivalent to ADR 0070's (that's a tower
      concept, tied to tower's own account/identity model) — every keep route in the table below
      requires its grant unconditionally, no self-action carve-out.

## Route → permission mapping

| Route family | Grant | Story |
|---|---|---|
| Stripe config read/write | `billing:manage` | [003](../keep/003-plan-mappings-checkout-and-billing-reads.md) (ADR 0052) |
| Plan-mappings CRUD | `billing:manage` | [003](../keep/003-plan-mappings-checkout-and-billing-reads.md) |
| Checkout-session creation | `billing:manage` | [003](../keep/003-plan-mappings-checkout-and-billing-reads.md) |
| Customer/subscriptions/refunds/disputes read | `billing:read` | [003](../keep/003-plan-mappings-checkout-and-billing-reads.md) |
| Revenue summary | `billing:read` | [003](../keep/003-plan-mappings-checkout-and-billing-reads.md) (ADR 0060, deliberately distinct from `billing:manage`) |
| Trials/coupons CRUD | `billing:manage` | [004](../keep/004-trials-and-coupons.md) |
| Usage-records read, usage-credentials issue/revoke | `billing:manage` | [005](../keep/005-usage-records-and-credentials.md) |
| Activity feed | `activity:read` | [006](../keep/006-self-service-config-and-activity.md) |

`GET /me/subscription` (Story 006) is deliberately **not** in this table — same reasoning as
tower's `/me/*`, authorized by "is this the caller's own account," not a `permissions` grant.
The Stripe webhook receiver is also excluded — it's authenticated by Stripe's own signature
scheme, not by anything on the internal JWT.

## Not Covered Here

- The tenant-JWKS-resolution prerequisite — see tower Story 014, identical open question, not
  re-derived here.

## Notes

- Same `@bytepunx/authstar-fastify` not-yet-published prerequisite as tower Story 014.

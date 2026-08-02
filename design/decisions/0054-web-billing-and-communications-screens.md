# ADR 0054: `web`'s Billing and Communications Screens

- **Status:** Accepted
- **Date:** 2026-08-01
- **Affects:** web, keep
- **Extends:** [ADR 0049](0049-web-admin-information-architecture.md)
- **Depends on:** [ADR 0052](0052-keep-herald-own-signet-access.md), [ADR 0053](0053-lifecycle-status-consolidation.md)

## Decision

### Billing (keep)

**Stripe Connection** — secret key + webhook secret entry (write-only, via ADR 0052's new
`stripe-config` route). **New finding folded in:** keep should validate the key at *set* time
with a cheap Stripe API call (e.g. a balance retrieve) rather than silently accept a bad key and
only discover it's broken on the first real checkout or webhook — a connection-health indicator
in the UI reflects this, not just "a key is present."

**Customer** — read-only, tenant-scoped and per-account, with a "view in Stripe Dashboard" deep
link (`https://dashboard.stripe.com/customers/{stripeCustomerId}`) — leans on Stripe's own
richer UI for anything beyond what `keep` itself tracks, rather than rebuilding it.

**Plan Mappings** — list (active plans by default, with a toggle to include retired ones),
create/edit, retire (`PATCH {status: "retired"}`, per ADR 0053 — **not** a real delete, since
existing subscribers on a retired plan still need their renewals processed correctly). The
`grantedRoles` editor uses the same live, tower-sourced application/role dropdowns already
established for Identity & Access (ADR 0047/0051) — not redesigned independently here.

**Checkout Sessions** — not a primary admin screen. Session creation is driven by the
`/_authstar/upgrade` proxied page ([ADR 0066](0066-portcullis-proxies-branded-pages-to-web.md))
or an embeddable widget (end users upgrading their own access), not something an admin routinely
does *for* a user. A small utility action ("send this customer a checkout link")
is a reasonable secondary affordance, not the section's main purpose.

**Subscriptions** — read-only list/detail, webhook-driven, as already scoped.

**Refunds and Disputes** (added by [ADR 0077](0077-keep-refunds-and-disputes.md)) — read-only,
webhook-driven, same posture as Subscriptions. A `needs_response` dispute gets a visible warning
treatment given Stripe's own response deadline, but no response-submission flow is built here —
that stays in the tenant's own Stripe dashboard, same deference this section already gives it
for Customer detail.

**Trials** — list, create, extend (`PATCH {expiresAt}`, appends to the `extensions` audit
trail, ADR 0039), revoke (`PATCH {status: "expired"}` per ADR 0053).

**Coupons** — list, create, revoke (`PATCH {status: "revoked"}` per ADR 0053).

**Usage** — `keep`'s `usage-records` list is the canonical admin-facing view; tower's own
materialized copy (which actually drives internal-token claims, ADR 0043) is not separately
surfaced here — showing both would risk displaying two transiently-inconsistent numbers for the
same thing.

### Communications (herald)

**Communication Types** — list (active by default, deprecated visible via toggle), create,
edit, deprecate (`PATCH {status: "deprecated"}` per ADR 0053 — historical `communication`
records referencing a deprecated type remain meaningful).

**Templates** — per-type version list, create new version (immutable once created — no edit/
delete, unchanged from ADR 0025's original design, confirmed still correct in this pass).

**Communication History** — list (filterable by `contactId`/type/status/date range), detail
(minimal audit fields only, never decrypted content inline), retry (`PATCH {status: "pending"}`
— already correctly `PATCH` from the start, ADR 0033), on-demand render (`GET .../render`,
narrowly permissioned, already correctly a `GET` on a representation rather than an action).

**Opt-outs** — view current opted-out categories, support-initiated add, remove/re-subscribe —
unchanged from ADR 0034; confirmed the category-removal `DELETE` is *not* part of ADR 0053's
fix (collection membership, not entity status).

**Suppressions** (added by [ADR 0074](0074-herald-bounce-complaint-and-suppression.md)) — list
(filterable by `reason`), manual add, admin-override remove. Deliberately a separate view from
Opt-outs, not merged into it — blanket/deliverability-driven vs. category-scoped/consent-driven
are different concerns that happen to share a `contactId` key.

**Sending Configuration** — provider, addresses, credential (write-only, via ADR 0052's
mechanism for herald's own `sending-config` route).

### Explicitly out of scope

Herald's payload-encryption keypair and unsubscribe-signing key (ADR 0025/0032) are
system-generated and never exposed for editing in `web` — consistent with how tower's own
session/internal signing keys aren't editable through any admin API either. Rotation, if ever
needed, is an operator/infrastructure concern, not a tenant-admin action. **Designed for
tower's session/internal/identity-hash keys by [ADR 0080](0080-tenant-key-rotation-ceremony.md)**
— an operator-only `steward` action, exactly the posture predicted here; herald's own keypair
rotation remains unaddressed (a separate, not-yet-designed ADR 0025/0032 follow-up, not covered
by 0080).

## Consequences

- Keep gains the Stripe-key validation-at-set-time behavior.
- Every screen in both sections that revokes/retires/deprecates a resource uses `PATCH`,
  consistent with ADR 0053.

## Related

- [ADR 0025](0025-versioned-templates-and-encrypted-payloads.md), [ADR 0032](0032-per-tenant-sending-and-can-spam.md), [ADR 0033](0033-herald-send-worker-and-retry.md), [ADR 0038](0038-plan-mapping-and-subscription-tracking.md), [ADR 0039](0039-keep-trials-and-coupons.md), [ADR 0041](0041-keep-api-surface.md), [ADR 0043](0043-application-reported-usage-metering.md), [ADR 0046](0046-tenant-owned-stripe-configuration.md), [ADR 0047](0047-application-and-role-slug-validation.md), [ADR 0049](0049-web-admin-information-architecture.md), [ADR 0052](0052-keep-herald-own-signet-access.md), [ADR 0053](0053-lifecycle-status-consolidation.md), [ADR 0074](0074-herald-bounce-complaint-and-suppression.md), [ADR 0077](0077-keep-refunds-and-disputes.md), [ADR 0080](0080-tenant-key-rotation-ceremony.md)

# ADR 0046: Tenant-Owned Stripe Configuration — Corrects the Single-Account Model

- **Status:** Accepted
- **Date:** 2026-07-30
- **Affects:** keep, portcullis, steward
- **Supersedes:** [ADR 0042](0042-single-account-billing-model.md)
- **Corrects:** [ADR 0038](0038-plan-mapping-and-subscription-tracking.md), [ADR 0040](0040-keep-erasure-response.md), [ADR 0041](0041-keep-api-surface.md), [ADR 0045](0045-steward-operator-console.md)
- **Vindicates the ownership direction (not the mechanism) of:** [ADR 0037](0037-stripe-connect-tenant-owned-merchant-accounts.md)

## Context

ADR 0042 modeled `keep` around one installation-wide Stripe account, with tenants as that
installation's own paying customers. That was wrong, and designing `steward`'s plan-mapping
correction (ADR 0045) surfaced why: `entitlement.scope: {tenant}` was never meant to represent
"the tenant paying authstar" — it represents a benefit applied broadly across a tenant's own
end-user population, funded by *that tenant's own business*. The whole `grantedRoles`/
`trialRoles` model is about **a tenant's own application granting access to that application's
own end users** (Math Overflow's subscribers pay Acme for pro features) — not about authstar
billing the tenant for the right to use authstar. Each tenant is a real business monetizing its
own product; it needs its own Stripe account to actually receive that revenue, exactly as ADR
0037 originally argued.

ADR 0037's *ownership direction* was correct. Its *mechanism* — Stripe Connect, with OAuth
onboarding, a `merchantAccount`/connect-callback flow, and platform-level webhook fan-out — was
overkill. Connect exists for platforms that need to onboard, oversee, and mediate many merchants
through one relationship with Stripe (KYC facilitation, revenue cuts, cross-merchant reporting).
None of that applies here. What's actually needed is the same shape already established for
exactly this kind of "each tenant plugs in their own credentials for an external service"
problem: **herald's per-tenant sending adapters (ADR 0032)**. A tenant just supplies their own
plain Stripe secret key and webhook secret, the same way they supply their own SMTP credentials.

`keep` is understood, going forward, as serving **only** tenant-level billing — giving each
tenant the tooling to run its own subscription billing for its own applications' end users.
Whether bytepunx (or any self-hosting operator) separately charges tenants for the right to use
authstar itself is an entirely orthogonal business concern, handled with the operator's own
tooling outside this system — `keep` has no first-class concept of it.

## Decision

### Each tenant supplies its own Stripe credentials — plain secrets, no Connect, no onboarding flow

```yaml
# keep's own signet bundle, tenant secrets
tenant-<slug>-stripe-secret-key
tenant-<slug>-stripe-webhook-secret
```

No `merchantAccount` actor, no OAuth connect/callback routes, nothing for a tenant to
"connect" — a tenant admin pastes their own Stripe secret key into `web`'s admin UI (or it's
provisioned via the same `SyncBundle` mechanism as any other tenant secret, ADR 0009/0011), and
it's immediately usable. This mirrors ADR 0032's herald pattern exactly, not a new pattern.

### `customer`, `planMapping`, `subscription` — unchanged shape, corrected ownership

None of these actors' *shapes* (ADR 0038/0042) need to change — only which Stripe account they
resolve against:

```ts
// customer — resolved against the tenant's own Stripe account
{ tenant: '', scope: { account: '' } | { tenant: '' }, stripeCustomerId: '' }

// planMapping — stripePriceId is a Price on the tenant's own account, defined by the tenant
{ tenant: '', stripePriceId: '', name: '', seatLimit: null, grantedRoles: [], meter: null }
```

`planMapping` reverts fully to **tenant-managed** — a tenant's own admin (via `web`'s `_admin`
application, `permissions`-gated) creates and edits their own plan mappings. This reverses ADR
0045's operator-only correction, which was itself only correct under ADR 0042's now-superseded
premise.

**Concretely, what "tenant-owned" means end to end:**

1. The Stripe Product/Price itself is created in the tenant's own Stripe Dashboard, or via a
   `web` convenience that calls Stripe's API with the tenant's own key — either way, entirely
   within the tenant's own account; `keep` has no opinion on how the Price came to exist.
   `web`'s plan-mapping editor should let the admin pick from a live list of their own Stripe
   Prices (fetched via their key) rather than requiring manual Price-ID copy-paste.
2. The `planMapping` record is created via `keep`'s `POST /tenants/{tenantSlug}/plan-mappings`,
   gated by the `billing:manage` permission (the example grant already named when `permissions`
   was introduced, ADR 0018/0019) — held typically by a tenant's own admin, not the operator.
3. `grantedRoles` values are opaque, unvalidated strings, consistent with ADR 0017 — `keep`
   doesn't check that a role name or application-scope reference is "real" against any
   registry, because there isn't one it can reach.

**A genuine limitation worth stating plainly:** because `keep` never calls `tower` directly
(ADR 0018's boundary), it cannot validate at write time that an `application` slug referenced
inside `grantedRoles` actually exists for that tenant. A typo'd slug doesn't error — it silently
produces an `entitlement.role-granted` event that never matches anything in tower's
application-scoped role filtering, so the grant is inert. `web`'s plan-mapping editor should
validate the application slug client-side against tower's own applications list, since `keep`
structurally cannot.

> **Resolved by [ADR 0047](0047-application-and-role-slug-validation.md)**, written immediately
> after this one: keep gains a local, tower-sourced reference cache (applications + active role
> definitions, seeded by a startup backfill) and validates `grantedRoles` against it at write
> time — the exact gap named above. The two ADRs were never cross-referenced before now, which
> made this limitation read as still-current to anyone encountering this ADR on its own; it
> isn't. Keep's plan-mapping writes reject an unknown application/role reference outright today.

### Webhook receiver: per-tenant, and now genuinely fits portcullis's routing model

ADR 0041 kept the webhook receiver outside portcullis specifically because a single
installation-wide webhook had no tenant to resolve against. That reasoning no longer applies —
each tenant's own Stripe account posts to its own webhook, which is now naturally tenant-scoped
the same way every other keep interaction is. The receiver moves to a reserved portcullis path:

```
POST /_authstar/webhooks/stripe
```

reached on the tenant's `_admin` application's host specifically (stable and always present,
per ADR 0044, rather than coupling the registered webhook URL to a product domain that might
change). Portcullis resolves tenant/application from `Host` as normal, then proxies straight
through to `keep` with **no session or JWT check of its own** — Stripe's own webhook signature
(verified by `keep` against `tenant-<slug>-stripe-webhook-secret`) is the actual authentication,
the same way it always was; portcullis is a transparent pass-through here, not a gatekeeper.

### Erasure: reverts to the tenant being the data controller

ADR 0040's original conclusion holds again: the Stripe Customer object lives on the *tenant's
own* Stripe account, so the tenant is its data controller, subject to their own legal-retention
obligations. `keep` does not reach into it on `contact.purged` — ADR 0042's reversal of this
point is itself reversed.

### `keep` needs no operator tier at all

With plan mappings, customers, and webhooks all tenant-scoped again, there is no remaining
installation-wide concept in `keep` for `steward` to manage. `steward`'s relationship to
**tower** (admins, OIDC providers, ADR 0021/0045) is entirely unaffected by this correction —
only its keep-specific role, added in ADR 0045 for the now-reversed plan-mapping restriction,
is removed.

### Usage metering (ADR 0043) is unaffected in mechanics

The app→portcullis→keep→tower loop, idempotency, and the `entitlement.usage-updated` contract
don't change — only the Stripe account `keep` reports usage against, which was already
described generically enough (ADR 0043 never assumed a specific account model) to require no
correction.

## Consequences

- **ADR 0042 is superseded** — kept as a record of what was considered and corrected, not
  deleted.
- **ADR 0038**: `planMapping` is tenant-defined again; the webhook-event table's
  `merchantAccount.status`/`account.updated` (Connect-specific) row is now moot rather than
  needing replacement — there's no connected-account status concept at all under this model.
- **ADR 0040**: its original conclusion (tenant is the data controller) is correct again; ADR
  0042's reversal of it doesn't apply.
- **ADR 0041**: the "Customer" route group's framing is unchanged in shape; "Plan mappings"
  reverts to fully tenant-scoped (`GET`/`POST`/`PATCH`/`DELETE` all under tenant `permissions`,
  no operator involvement); the webhook receiver moves from a direct keep-owned ingress to a
  portcullis reserved path.
- **ADR 0045**: its keep-specific plan-mapping correction is reversed; its tower-facing
  reasoning (why `steward` exists at all, the shared operator-token, direct port-forward
  posture) is entirely unaffected.
- New portcullis story needed for the `/_authstar/webhooks/stripe` reserved pass-through route
  — written alongside this ADR.

## Related

- [ADR 0032](0032-per-tenant-sending-and-can-spam.md) (the herald precedent this mirrors), [ADR 0038](0038-plan-mapping-and-subscription-tracking.md), [ADR 0040](0040-keep-erasure-response.md), [ADR 0041](0041-keep-api-surface.md), [ADR 0043](0043-application-reported-usage-metering.md), [ADR 0044](0044-web-surfaces-and-distribution-model.md), [ADR 0045](0045-steward-operator-console.md)

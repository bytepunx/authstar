# ADR 0042: Single-Account Billing Model — Tenants Are Customers of the Installation

- **Status:** Superseded by [ADR 0046](0046-tenant-owned-stripe-configuration.md)
- **Date:** 2026-07-29
- **Affects:** keep
- **Supersedes:** [ADR 0037](0037-stripe-connect-tenant-owned-merchant-accounts.md)
- **Corrects:** [ADR 0038](0038-plan-mapping-and-subscription-tracking.md), [ADR 0040](0040-keep-erasure-response.md), [ADR 0041](0041-keep-api-surface.md)

> **Superseded 2026-07-30.** This ADR's own correction of ADR 0037 went too far: it correctly
> rejected Stripe Connect as overkill, but incorrectly concluded tenants shouldn't own their own
> Stripe account at all. `entitlement.scope: {tenant}` was always meant to represent a benefit a
> tenant's own business funds for its own end users, not the tenant paying authstar — which
> means each tenant genuinely needs to receive its own revenue. See
> [ADR 0046](0046-tenant-owned-stripe-configuration.md) for the corrected model: tenant-owned
> Stripe, but via plain per-tenant credentials (mirroring herald's adapter pattern, ADR 0032),
> not Connect. Kept below for the record of what was considered.

## Context

ADR 0037 modeled keep as a multi-sided marketplace platform (Stripe Connect), with each tenant
bringing and owning their own Stripe merchant account. That was a misunderstanding of the
actual business model. An authstar installation — whether bytepunx's own hosted SaaS, or a
self-hosting adopter's own deployment — is itself a single business operating **one** Stripe
account. Tenants are that installation's own paying customers, buying access (at varying
levels, seat counts, or metered usage) to one or more applications — not separate merchants
each processing their own payments through authstar. This is a standard single-merchant SaaS
billing shape, not Connect at all.

## Decision

### One Stripe account per installation

Keep holds a single Stripe secret key and webhook signing secret — both signet-managed secrets
in keep's own bundle (ADR 0004's pattern), not per-tenant OAuth credentials. **The
`merchantAccount` actor and the Connect OAuth onboarding flow (ADR 0037) are removed
entirely** — there is nothing for a tenant to "connect"; the installation's Stripe account
simply exists, configured once by whoever operates the installation.

### Tenants (and individual accounts) are Stripe Customer records on that one account

```ts
// keep — replaces `merchantAccount`
{ tenant: '', scope: { account: '' } | { tenant: '' }, stripeCustomerId: '' }
```

Symmetric for both org-level (tenant-scoped) and individual (account-scoped, B2C) billing —
both are Customer records on the same shared account, matching the org/individual duality
already established in ADR 0018/0038's `subscription`.

### Plans are operator-defined, not tenant-defined

`planMapping`'s (ADR 0038) `stripePriceId` refers to a Price on the **installation's own**
account, created by whoever operates the installation — not something each tenant sets up
themselves. "Varying levels of access to one or more applications" needs no new mechanism:
`grantedRoles` already supports application-scoped roles (ADR 0017), so a plan granting access
to a specific subset of a tenant's applications is just a plan mapping whose roles carry that
scope.

### Metered/usage-based billing — newly in scope, minimal contract only

The corrected description explicitly names metered usage as a real payment model to support,
which ADR 0038 never addressed. Stripe supports this via metered Prices plus usage records
reported against a subscription item. Keep needs an endpoint to record a usage event and
forward it to Stripe as a usage record — **where usage events actually originate** (tower
per-API-call telemetry? an aggregate from lookout/chronicle? an adopting application reporting
its own usage directly?) **is not resolved here**, flagged as a follow-up in the same pattern as
every other deliberately-deferred item in this design, not designed further in this ADR.

### Erasure reconsidered: the installation is the data controller now, not the tenant

ADR 0040's reasoning ("the tenant owns their Stripe Customer, it's their data-controller
responsibility, keep doesn't touch it on erasure") depended entirely on ADR 0037's
tenant-owned-account model and no longer holds. The installation's own Stripe account now holds
these Customer records, so the installation operator is the data controller. On
`contact.purged`, for an **account-scoped** (individual/B2C) Customer, keep must now actually
act — delete or anonymize the Stripe Customer object it owns, subject to the same
legal-retention carve-out already established (financial/tax records may still need independent
retention under GDPR Article 17(3), same principle as before, just now keep performs the
anonymization directly rather than deferring to the tenant). **Tenant-scoped** (org-level)
Customer records are not themselves erasure targets — erasure requests are inherently about an
individual person (a `contact`/`account`), not an organization.

### Webhook receiver — simpler than before, same open question

With one account instead of Connect's platform-plus-connected-accounts model, the webhook
endpoint is now just a single, ordinary Stripe webhook — not "platform-level events across many
connected accounts," just the installation's own events. The routing-topology question ADR 0041
raised (through portcullis as a reserved path, vs. a direct keep-owned ingress) is unaffected in
substance and still open.

## Consequences

- **ADR 0037 is superseded** — its Connect/OAuth/merchant-account design no longer applies.
  Kept as a record of what was considered and corrected, not deleted.
- **ADR 0038**: `planMapping.stripePriceId` is operator-defined, not tenant-defined;
  `merchantAccount.status` references in the webhook-event table should read as the new
  `customer` record above; `account.updated` (a Connect-specific event) no longer applies.
- **ADR 0040**: the Stripe-Customer-is-the-tenant's-responsibility conclusion is reversed for
  account-scoped customers — keep now participates directly in erasure for those.
- **ADR 0041**: the entire "Merchant account" route group (connect/callback) is removed; a
  `customer` read route and a usage-reporting route are needed instead — not laid out in
  route-inventory detail here, left for a follow-up pass over ADR 0041 alongside the usage-event
  source question.

## Related

- [ADR 0004](0004-signet-for-configuration-and-secrets.md), [ADR 0017](0017-account-identity-and-role-model.md), [ADR 0018](0018-trial-roles-and-keep-boundary.md), [ADR 0023](0023-pii-isolation-via-hashed-contact-records.md), [ADR 0026](0026-erasure-cascade.md)

# ADR 0037: Stripe Connect Standard Accounts — Tenants Own the Merchant Relationship

- **Status:** Superseded by [ADR 0042](0042-single-account-billing-model.md)
- **Date:** 2026-07-29
- **Affects:** keep
- **First foundational decision for `keep`'s design**

> **Superseded 2026-07-29.** Based on a misunderstanding of the business model: authstar
> installations are single-merchant SaaS businesses (tenants are the installation's own paying
> customers), not multi-sided marketplaces where each tenant brings their own merchant account.
> See [ADR 0042](0042-single-account-billing-model.md) for the corrected single-Stripe-account
> design. Kept below for the record of what was considered.

## Context

Unlike herald's per-tenant sending adapters, there's no generic "SMTP of payments" — Stripe,
Paddle, and Braintree have fundamentally different APIs and subscription/invoicing semantics,
so "pluggable provider, tenant brings their own" isn't the right shape for the first decision
here. The question that actually matters first is who is legally the merchant of record: does
authstar operate one shared payment-processing account all tenants' revenue flows through, or
does each tenant own their own account? A shared account would be the payments-domain version
of the authstar.io-sending-email problem herald was designed to avoid — except with real
regulatory/liability exposure attached, not just a deliverability concern.

## Decision

### Stripe Connect, Standard account type

Each tenant gets their own **Stripe Connected Account, type Standard** — a full, tenant-owned
Stripe account. Money flows to the tenant directly; the tenant sees and controls their own
Stripe dashboard, payouts, and tax reporting; Stripe handles KYC/compliance directly with the
tenant. Keep gets API access to act on the account via Connect's OAuth-based authorization, not
by owning or intermediating the account itself. This is deliberately the option (among
Standard/Express/Custom) that maximizes tenant ownership — Express and Custom both trade tenant
control for more platform involvement, which is the wrong direction here.

### Keep's own `merchantAccount`, not a reach into tower's `tenant`

Consistent with keep never calling tower directly (ADR 0018), keep holds its own actor
referencing the tenant by slug, not a live lookup against tower's `tenant`:

```ts
{ tenant: '', stripeAccountId: '', status: 'connected' | 'disconnected' | 'needs-reauth', connectedAt: '' }
```

`web` has already validated the caller's own tenant membership before ever calling keep — keep
trusts the tenant slug it's given, the same trust boundary already established for every other
`web` → keep interaction.

### Secrets split — same principle as ADR 0020, applied to keep now

`stripeAccountId` is a plain identifier, not secret (comparable to a username). The actual
OAuth access token/API credential used to act on the connected account is signet-managed,
pushed at connect-time, **never persisted in keep's own event log** — identical reasoning to
why tower never durably stores provider `clientSecret`s or signing keys.

### Onboarding: `web`-initiated OAuth connect flow

A tenant admin initiates connecting (or creating) their Stripe account from `web`, redirected
through Stripe's Connect OAuth flow, returning with an authorization code that keep exchanges
for the connected account's ID and access credential.

### Webhooks: one platform-level endpoint, not per-tenant

Stripe Connect platforms subscribe to events across all their connected accounts through a
single platform-level webhook endpoint — each event payload identifies which connected account
it belongs to. Keep registers one such endpoint and correlates incoming events back to the
right `merchantAccount`/tenant, rather than each tenant needing its own separate webhook
configuration.

### No change to the entitlement event contract (ADR 0031)

Stripe/payment events are the *trigger*, not the contract. A `checkout.session.completed` or
`invoice.paid` webhook leads keep's own domain logic to decide "this tenant converts from trial
to paid, with these seat limits/roles," which then publishes `entitlement.converted-to-paid`
exactly as already specified — this ADR only changes where the trigger comes from, not what
gets published downstream.

## Consequences

- Keep needs a Connect-OAuth exchange flow and a platform-level webhook receiver.
- The broader plan/subscription/coupon domain model is **not** resolved by this ADR — this is
  specifically the merchant-relationship foundation; the rest of keep's design builds on it in
  follow-up passes.

## Related

- [ADR 0018](0018-trial-roles-and-keep-boundary.md), [ADR 0020](0020-tenant-application-actors-and-secret-handling.md), [ADR 0031](0031-keep-tower-entitlement-events.md), [ADR 0032](0032-per-tenant-sending-and-can-spam.md) (the herald analog this decision parallels)

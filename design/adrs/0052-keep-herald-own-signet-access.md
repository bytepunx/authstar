---
id: ADR-0052
title: Keep and Herald Gain Narrow Signet Access for Self-Managed Tenant Secrets
status: accepted
date: 2026-08-01
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0052: Keep and Herald Gain Narrow Signet Access for Self-Managed Tenant Secrets

- **Status:** Accepted
- **Date:** 2026-08-01
- **Affects:** keep, herald
- **Generalizes:** [ADR 0011](0011-minimizing-towers-signet-footprint.md)
- **Fills a gap left implicit by:** [ADR 0046](0046-tenant-owned-stripe-configuration.md), [ADR 0049](0049-web-admin-information-architecture.md)

## Context

Neither Billing's Stripe secret-key entry (ADR 0046) nor Communications' sending-config
credential (ADR 0032/0034/0049) ever specified the actual mechanism by which a secret submitted
through `web` reaches signet. ADR 0011 solved this exact problem for tower — a narrowly-scoped,
elevated `GitOpsService` admin token, plain file trees, no git machinery — but scoped it to
tower specifically because tower authors *other* services' bundles (portcullis has no admin API
of its own to receive such a write). Keep and herald are different: both have their own full
admin APIs and manage their own bundles. They need the same capability ADR 0011 gave tower, just
narrower — write access to their own bundle only, not across services.

## Decision

Keep and herald each get their own narrow `GitOpsService`-scoped signet admin token, delivered
as a secret in their own bundle — same delivery pattern as tower's own token. Same "no git
machinery, plain file trees, empty `head_sha`" approach as ADR 0011; that reasoning generalizes
directly and doesn't need restating.

Concretely: `keep`'s new `stripe-config` route and herald's `sending-config` route each, on
receiving a secret value, push it to their **own** bundle via `SyncBundle` using their own
token — never routing through tower as an intermediary, since (unlike portcullis) they already
have their own API surface to receive the write directly.

### New keep route, filling the gap ADR 0046 left implicit

```
GET, PATCH  /tenants/{tenantSlug}/stripe-config
```

`GET` never returns the secret key (write-only, same discipline as every other secret in this
design); `PATCH` accepts the secret key and webhook secret. Gated by `billing:manage`.

Consequent's own event log for keep/herald records that a secret was set/rotated (who, when),
never its plaintext value — the same discipline ADR 0020 established for tower.

## Consequences

- Keep and herald's own deployment configuration needs this new signet admin token
  provisioned — a one-time operational step, the same category as tower's own bootstrap.
- Stated as a general principle for any future service with the same need (its own admin API,
  managing its own bundle), not just these two.

## Related

- [ADR 0009](0009-tenant-data-via-syncbundle-no-github.md), [ADR 0011](0011-minimizing-towers-signet-footprint.md), [ADR 0020](0020-tenant-application-actors-and-secret-handling.md), [ADR 0032](0032-per-tenant-sending-and-can-spam.md), [ADR 0046](0046-tenant-owned-stripe-configuration.md)

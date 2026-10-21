---
id: ADR-0022
title: "`herald` — a Dedicated Communications Service"
status: accepted
date: 2026-07-24
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0022: `herald` — a Dedicated Communications Service

- **Status:** Accepted
- **Date:** 2026-07-24
- **Affects:** tower, keep, portcullis (as publishers), a new service — `herald`

> **Corrected 2026-08-05 ([ADR 0084](0084-herald-actor-boundary-corrections.md)):**
> `communicationType`'s only confirmed key material was the bare `{type}` route parameter — a
> real cross-tenant collision risk, likely the highest-probability one found across this whole
> pass, since tenants are *expected* to reuse conventional type names like `"invite-sent"`.
> Corrected to a composite `{tenant}:{type}` key. `communication`'s `idempotencyKey` business key
> also gained the same tenant-scoping fix already applied to keep's `usageRecord` (ADR 0083).

## Context

Every service that needs to notify a human (invite sent, trial expiring, payment failed,
eventually marketing communications) shouldn't each independently own email rendering, provider
integration, and compliance concerns like opt-outs. A dedicated service, reached only via
RabbitMQ (consistent with the messaging infrastructure already established — ADR 0006), keeps
that logic in one place and keeps every publisher decoupled from how a message actually gets
delivered.

## Decision

Naming: `herald`.

### Naming: `herald`

Continuing the castle theme with a role, not just a structure: a herald's literal job was
carrying messages and making proclamations. Fits a service that starts with email and is
expected to grow into other channels (SMS, push) without needing a rename.

### Publish contract: self-contained messages, no callback dependency

Consistent with every other cross-service boundary in this system (keep → tower is async and
self-contained; nothing calls back into the publisher for more data), a communication request
carries **everything herald needs to render and send it** — herald has no read access to
tower's or keep's data and never calls back into either.

Routing key convention: `comms.<category>.<type>` (e.g. `comms.transactional.invite-sent`,
`comms.marketing.product-announcement`) — lets herald bind queues by category, and leaves room
for a future marketing-automation source to publish onto the same `comms.marketing.*` space
without herald caring who the publisher was.

Message payload:

```ts
{
  idempotencyKey: '',     // publisher-supplied, stable -- see below
  tenant: '', application: null,
  category: 'transactional' | 'marketing',   // extensible
  type: 'invite-sent',       // specific template/message type
  channel: 'email',            // email now; sms/push reserved for later
  to: '',                        // email address today; channel-appropriate address later
  templateData: {},
}
```

**Idempotency is load-bearing, not optional.** RabbitMQ is at-least-once (ADR 0006) — a
redelivered message must not double-send. The publisher supplies a stable `idempotencyKey`
(e.g. tower using `invite:{token}:sent`), and herald uses it **as the `communication` actor's
own business key** — a redelivery just re-`fetch`es the existing actor rather than creating a
duplicate or re-sending. This is a direct, deliberate consequence of ADR 0006's delivery
guarantee, not a nice-to-have.

### `herald`'s own domain model

Uses consequent, consistent with tower/keep.

**`communication` actor** — identified by the publisher's `idempotencyKey`:

```ts
{
  state: {
    tenant: '', application: null, category: '', type: '', channel: '', to: '',
    templateData: {},
    status: 'pending',   // pending | rendered | sent | delivered | bounced | failed | suppressed
    createdAt: '', sentAt: '',
  }
}
```

Rendering and actually sending (calling an email provider) are I/O — they can't live in
consequent's pure event handlers (`apply()` must stay deterministic, no I/O, per consequent's
own constraint). This needs the same shape any consequent-based service uses for external
side effects: a worker reacts to the "communication requested" event, performs the render+send,
and issues a follow-up command (`markSent`/`markFailed`) to update the actor's state — not a
new pattern, just worth naming explicitly since it's herald's first time needing it in this
design.

**`optOut` actor** — identified by `{tenant}:{email}`, holding the set of categories that
address has opted out of:

```ts
{ state: { tenant: '', email: '', optedOutCategories: [] } }
```

Keyed by **email**, not `accountId` — an unsubscribe must work for someone without an account
yet, and an opt-out must survive account deletion (losing it on account deletion would force an
unwanted re-subscription, a compliance problem, not just a UX one). Tenant-scoped, not
application-scoped, matching how cookie/session identity is already tenant-shared (ADR 0016) —
one brand, one opt-out list, not one per product.

### Category gates whether opt-out is checked

`transactional` messages (invites, security-relevant notices, trial-status changes about the
recipient's own account) always send — they're not subject to opt-out. `marketing` messages
check `optOut` before sending and are suppressed (`status: suppressed`, not sent) if the
recipient has opted out of that category for that tenant.

## Explicitly Deferred

- Bounce/complaint handling and broader suppression-list management (deliverability concerns
  beyond simple opt-outs) — a real future need, not designed here. **Resolved by
  [ADR 0074](0074-herald-bounce-complaint-and-suppression.md)** for API-based adapters (SES);
  SMTP-adapter bounce/complaint signal remains out of scope, per the reasoning ADR 0032 already
  gave.
- Per-tenant/per-application template branding (so Math Overflow's emails look like Math
  Overflow, not generic authstar) — deferred to whenever herald's actual rendering pipeline is
  designed. **Resolved by [ADR 0078](0078-herald-template-branding.md)**: logic-less
  mustache-style rendering, named explicitly, plus an `application.branding` override.
- Additional channels (SMS, push) — the `channel` field exists from day one so this doesn't
  require a contract change later, but only `email` is implemented now.

## Consequences

- New service, new repo (`authstar-herald` or similar, not created yet).
- Root `claude.md`'s service list needs updating to include `herald`.
- Tower, keep, and portcullis (wherever a notification-worthy event occurs) become RabbitMQ
  publishers onto `comms.*`, each supplying a stable idempotency key for what they publish.

## Related

- [ADR 0006](0006-rabbitmq-as-message-broker.md), [ADR 0001](0001-claims-enrichment-via-tower.md)

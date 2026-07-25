# ADR 0026: Erasure Cascade Across Services

- **Status:** Accepted
- **Date:** 2026-07-24
- **Affects:** tower, herald, keep, portcullis
- **Amends:** [ADR 0024](0024-contact-lifecycle-sync-to-herald.md) (generalizes `herald.contact.purged`)
- **Closes a gap introduced by:** [ADR 0025](0025-versioned-templates-and-encrypted-payloads.md)

## Context

ADR 0023 made deleting the `contact` row the erasure mechanism; ADR 0024 gave herald a way to
purge its own `optOut` copy in response. Two things were missing: the signal was herald-specific
rather than generalized to any service that might hold derived data, and — since ADR 0025
introduced encrypted communication payloads *after* ADR 0024 was written — herald's own purge
handling never got extended to cover them. As it stands, an "erased" person's data would still
be recoverable through herald's own decrypt capability, which defeats the point of erasing them
at all.

## Decision

### Generalize the purge signal

`herald.contact.purged` (ADR 0024) becomes **`contact.purged`** — published once by tower when
a `contact` row is deleted, consumer-agnostic. Any interested service binds its own queue;
RabbitMQ's normal fan-out (multiple independent queues bound to one publish) handles the rest,
no change to the publishing side beyond the name.

### Close the herald gap: purge encrypted payloads, not just opt-out

On `contact.purged`, herald must also strip or orphan `encryptedPayload` on every
`communication` record for that `contactId` — not just delete `optOut`. The minimal audit
fields (`contactId` hash, `type`, `status`, timestamps) can stay, since they carry no PII on
their own, but the encrypted content must go, or herald's decrypt capability (ADR 0025)
continues to be a way to recover exactly what erasure was supposed to remove.

### Subscribers acknowledge completion

Each subscribing service publishes `contact.purge.acknowledged` (`{ tenant, contactId, service
}`) once it has finished purging its own copy.

### Tower tracks completion — a new `erasureRequest` actor

```ts
{ tenant: '', contactId: '', requestedAt: '', status: 'pending' | 'completed', acknowledgedBy: [] }
```

Status flips to `completed` once every service on a small, explicit, tower-held list (herald,
keep, ...) has acknowledged — not a dynamic registry, just a fixed list appropriate to the
system's current size. This record carries no PII (contactId hash only) and can be retained
indefinitely as proof of compliance — worth having given GDPR's actual response-time
obligations, where being able to show "erasure request X completed at time Y, confirmed by
services [herald, keep]" matters.

### Keep — flagged, not designed

Financial/transaction data often carries independent legal retention requirements (tax,
accounting) that can limit the right to erasure under GDPR itself (Article 17(3)'s
legal-obligation exception). Keep's response to `contact.purged` is very unlikely to be a
blanket delete — more likely anonymize-and-retain-the-facts, disassociating the `contactId`
while keeping whatever a given jurisdiction requires kept. Not resolved here; belongs to keep's
own domain design.

### Portcullis is not a cascade target

Portcullis holds no durable PII store — session state is a stateless, client-held cookie, not a
server-side record. The relevant safeguard is the same "never log PII" discipline already
established for herald, not a new purge mechanism.

### `web` — deferred

Likely the erasure request's actual initiation point (an admin action, or a self-service
"delete my account" flow, calling tower's API to delete the `contact` row and kick off this
cascade) — not designed here, since `web` itself hasn't been designed yet.

## Consequences

- Herald's `contact.purged` handling (ADR 0024) is extended to cover `communication` payloads,
  not just `optOut`.
- New `erasureRequest` actor in tower.
- Keep's actual purge/anonymization behavior remains an open, explicitly deferred question.
- The fixed "expected services" list needs to grow deliberately as new PII-holding services are
  added — worth remembering when herald-like services are introduced later.

## Related

- [ADR 0022](0022-herald-communications-service.md), [ADR 0023](0023-pii-isolation-via-hashed-contact-records.md), [ADR 0024](0024-contact-lifecycle-sync-to-herald.md), [ADR 0025](0025-versioned-templates-and-encrypted-payloads.md)

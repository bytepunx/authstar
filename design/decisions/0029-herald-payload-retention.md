# ADR 0029: Encrypted Payload Retention in Herald

- **Status:** Accepted
- **Date:** 2026-07-25
- **Affects:** herald
- **Resolves the open item in:** [ADR 0025](0025-versioned-templates-and-encrypted-payloads.md)

> **Extended 2026-08-02 ([ADR 0081](0081-herald-key-rotation.md)):** this sweep gains one more
> responsibility — when purging the last `encryptedPayload` referencing a given
> `payloadKeyVersion`, also discard that private key generation. Purging and key-generation
> pruning now share the same trigger.

## Context

ADR 0025 flagged `encryptedPayload` retention as worth bounding but left it unresolved. It
matters for three concrete reasons: defense in depth (retention length is the actual blast
radius if herald's private key is ever compromised — a bounded window of exposure, not the
system's entire history), GDPR's storage-limitation principle (personal data shouldn't be kept
longer than its purpose requires), and it shrinks what the erasure cascade (ADR 0026) has to
reach on-demand — time-based purging handles the common case automatically.

## Decision

### Retention is configurable per `communicationType`, not a single global constant

`communicationType` (ADR 0025) gains a `retentionDays` field, defaulting to 30 days unless a
specific type overrides it. Some types legitimately need longer retention than others — a
legally-significant notice may need to remain provable for compliance-defensibility purposes
well past when routine transactional or marketing content is useful to keep. This is a real,
type-dependent policy difference, not something to flatten into one number.

### The retention clock starts at `createdAt`, not `sentAt`

This bounds worst-case retention regardless of delivery outcome — a failed or bounced
communication still needs a retention bound, and may never have a meaningful `sentAt` at all.

### Purging is a scheduled sweep, not a reactive mechanism

The same operational shape as ADR 0012's RabbitMQ-credential-rotation `CronJob`: a periodic
(e.g. daily) herald-owned job finds `communication` records past their type's retention
deadline and clears `encryptedPayload`. This is a **second path** into the same clearing
operation ADR 0026 already defined for `contact.purged` — time-based expiry and on-demand
erasure both converge on the same effect, just triggered differently.

### `communication` gains `payloadPurgedAt`, kept separate from `status`

```ts
{ ..., status: '', payloadPurgedAt: null }
```

`status` continues to describe send-lifecycle outcome (sent/failed/bounced/etc.);
`payloadPurgedAt` is a distinct axis — payload availability. Without this, on-call encountering
an empty `encryptedPayload` can't tell "purged on schedule, as expected" from any other
unexpected state — worth being explicit rather than requiring inference.

## Consequences

- `communicationType` (ADR 0025) needs a `retentionDays` field.
- Herald needs a scheduled sweep job, operationally analogous to ADR 0012's provisioner
  `CronJob`.
- `communication`'s state (ADR 0025) gains `payloadPurgedAt`.
- The minimal audit fields (contactId hash, type, title, status, timestamps) are unaffected by
  this policy — they were already established as low-sensitivity and fine to retain
  indefinitely (ADR 0025); only `encryptedPayload` is in scope here.

## Related

- [ADR 0025](0025-versioned-templates-and-encrypted-payloads.md), [ADR 0026](0026-erasure-cascade.md), [ADR 0012](0012-rabbitmq-user-provisioning-job.md) (scheduled-sweep precedent)

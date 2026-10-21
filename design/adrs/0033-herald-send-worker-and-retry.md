---
id: ADR-0033
title: Herald Send Worker, Retry, and Dead-Letter Handling
status: accepted
date: 2026-07-25
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0033: Herald Send Worker, Retry, and Dead-Letter Handling

- **Status:** Accepted
- **Date:** 2026-07-25
- **Affects:** herald

## Context

ADR 0025 named "a worker reacts to the event and performs the render+send" without specifying
retry or failure handling — a real gap identified in the herald completeness pass, and one
worth resolving before the API surface, since manual retry directly shapes the `communication`
resource.

## Decision

RabbitMQ delivers the request once; herald owns retry itself.

### RabbitMQ delivers the request once; herald owns retry itself

Herald acks the inbound `comms.*` message as soon as the `communication` actor is durably
created (`status: pending`) — safe under at-least-once delivery because of the
idempotency-key-as-business-key pattern already established (ADR 0022). Retry logic lives
entirely in herald's own state from that point on, not in RabbitMQ nack/redelivery — conflating
"not yet processed" with "failed, needs backoff" in one queue's semantics would be worse than
owning this directly.

### Transient vs. permanent failure

A worker attempts the send via the resolved adapter (ADR 0032). The adapter's returned error is
classified: transient (network timeout, provider rate-limit) is retried; permanent (invalid
recipient format, bad credentials) fails immediately — retrying a permanent failure either
wastes attempts or reproduces the identical result forever.

### Exponential backoff via a scheduled sweep, not a held connection

`communication` (ADR 0025) gains `retryCount`, `nextRetryAt`, `lastAttemptAt`, `lastError` (a
short error category, not raw provider text — same discipline as everywhere else in this
design). A capped attempt count with exponential backoff (tunable defaults, not load-bearing
specifics here — on the order of 5 attempts, doubling from 30s) is tracked via these fields. A
**separate scheduled sweep**, the same operational shape as ADR 0029's retention sweep, picks up
records whose `nextRetryAt` has passed — not the original worker blocking/holding state waiting
for a retry window.

### Exhausted retries land in the existing `failed` status — no new state needed

Terminal, no further automatic retry attempted.

### Manual retry is `PATCH`, not a new action endpoint

Consistent with ADR 0030's state-transition convention: `PATCH /communications/{id}` with
`{ status: "pending" }` re-queues a failed communication, resetting `nextRetryAt` so it's picked
up on the next sweep pass rather than waiting out whatever backoff schedule it had reached.

## Consequences

- `communication`'s state gains `retryCount`, `nextRetryAt`, `lastAttemptAt`, `lastError`.
- Herald needs a scheduled sweep job for retries, alongside the one already needed for
  retention (ADR 0029) — likely the same job, different pass, rather than two separate
  processes, though not specified further here.
- The API surface (next) needs `PATCH` support for `communication.status`, following the same
  pattern already used for `account.status`.

## Related

- [ADR 0022](0022-herald-communications-service.md), [ADR 0025](0025-versioned-templates-and-encrypted-payloads.md), [ADR 0029](0029-herald-payload-retention.md), [ADR 0030](0030-tower-api-surface.md), [ADR 0032](0032-per-tenant-sending-and-can-spam.md)

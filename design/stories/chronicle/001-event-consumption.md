# Story 001 — Event Consumption

**Epic:** Analytics Storage
**Repo:** chronicle
**Status:** Draft
**New — chronicle's side of the mechanism [ADR 0035](../../decisions/0035-lookout-and-chronicle-analytics.md)
already specifies.** Per [ADR 0035](../../decisions/0035-lookout-and-chronicle-analytics.md),
[ADR 0085](../../decisions/0085-chronicle-clickhouse-schema.md).
**Depends on:** [ADR 0085](../../decisions/0085-chronicle-clickhouse-schema.md)'s
`analytics_events` table, [lookout Story 001](../lookout/001-ingestion-contract.md)'s publishing
side.

---

## Summary

Chronicle's own domain model is exactly one table (ADR 0085) — this story is the consumer that
gets events from RabbitMQ into it. No `consequent`, no business invariants, no upsert/merge
logic: "write what arrived, make it queryable" (ADR 0035).

---

## Consumption

- [ ] Consumes the **non-durable** RabbitMQ exchange/queue(s) lookout publishes to (ADR 0035) —
      `analytics.auth.*`, `analytics.request`, `analytics.client.*`, one binding covering the
      whole `analytics.#` routing-key space rather than a separate binding per event type, since
      every event lands in the same table regardless of type (ADR 0085).
- [ ] Maps each message directly onto `analytics_events`'s columns (ADR 0085) — `tenant`/
      `application`/`eventType`/`timestamp`/`identityHash` always; `idp`/`reason` for
      `analytics.auth.*`; `method`/`path`/`status`/`latencyMs` for `analytics.request`;
      `clientPayload` (the raw JSON body) for `analytics.client.*`. Fields that don't apply to a
      given event's type are left `NULL`, not zero-valued or empty-string — a `NULL` `reason` on
      a `login-succeeded` event is correct, not missing data.
- [ ] **No dedup, no idempotency key check** — a redelivered message is simply inserted again.
      Consistent with this pipeline's already-accepted loss-tolerance (ADR 0035): if occasional
      duplication under redelivery were a real problem, the fix would be tightening RabbitMQ's
      own delivery guarantees upstream, not adding merge logic to an engine chosen specifically
      because it doesn't need any (ADR 0085's `MergeTree` choice).
- [ ] Batches inserts rather than one `INSERT` per message — ClickHouse is materially more
      efficient with batched writes, and this pipeline's own non-durable, loss-tolerant posture
      means a small, bounded batching window (a few seconds, or a few hundred rows, whichever
      comes first) costs nothing this design hasn't already accepted elsewhere in the same ADR.
- [ ] A malformed message (missing a required always-present field, an `eventType` chronicle
      doesn't recognize) is logged and dropped, not retried and not fatal to the consumer —
      matching lookout's own posture (validate what you can, don't let one bad event block
      everything behind it).

---

## Configuration

- [ ] Chronicle's own signet bundle (ADR 0004's pattern, ADR 0036) holds `retentionMonths`
      (default `24`) plus ClickHouse and RabbitMQ connection details — no tenant-scoped config
      of any kind, since retention is global-only today (ADR 0036).
- [ ] `retentionMonths` is read once at table-creation/migration time to build the `TTL` clause
      (ADR 0085) — changing it later requires a schema migration (`ALTER TABLE ... MODIFY TTL`),
      not a live config reload; this story doesn't design a live-reload path for it, consistent
      with retention being named a "sufficient for today" global setting rather than a frequently
      -tuned one.

---

## Not Covered Here

- The reporting/query API — [Story 002](002-reporting-api.md).
- Lookout's own publishing/validation — [lookout Story 001](../lookout/001-ingestion-contract.md).
- Per-tenant retention overrides — named as a viable future extension (ADR 0036), not designed
  here.

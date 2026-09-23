# Story 001 — Ingestion Contract

**Epic:** Analytics Ingestion
**Repo:** lookout
**Status:** Draft
**New — lookout's side of the mechanism [ADR 0035](../../decisions/0035-lookout-and-chronicle-analytics.md)
already specifies, naming the one thing it left unnamed: lookout's own ingestion route.**
Per [ADR 0035](../../decisions/0035-lookout-and-chronicle-analytics.md),
[ADR 0058](../../decisions/0058-analytics-event-shape-corrections.md).
**Depends on:** [tech-stack.md](../../docs/tech-stack.md)'s choice of fastify for lookout
(lightweight — no `consequent`, no database, per `claude.md`).

---

## Summary

Lookout is the simplest service in this design by construction: no `consequent`, no database,
no per-tenant config of its own — "validate → publish to RabbitMQ → done" (ADR 0035). Two
callers reach it (portcullis's server-side dispatch, and portcullis's forwarded client-event
route), both hitting the **same** ingestion endpoint — they differ only in which validations
already ran upstream, not in URL or shape.

---

## `POST /events` — the one endpoint

ADR 0035 described both ingestion paths at the pattern level (mirrors portcullis→tower's SPIFFE
model) but never named a literal path for lookout's own side — closed here.

```
POST /events
{
  tenant: '', application: '', eventType: '',
  identityHash: '',       // omitted entirely if no valid session existed
  ...event-type-specific fields (idp, reason, method, path, status, latencyMs, or an
                                   allowlisted client payload)
}
```

### Auth — SPIFFE mTLS only, one caller

- [ ] The **only** caller of this endpoint is portcullis, over SPIFFE mTLS — the same
      service-to-service pattern as portcullis→tower (ADR 0035). There is no browser-reachable
      path to lookout at all; the client-facing route lives entirely on portcullis
      (`POST /_authstar/analytics/events`, portcullis's own story), which forwards here only
      after attaching server-verified `tenant`/`application`/`identityHash` itself — lookout
      never receives or trusts anything client-asserted directly.
- [ ] Because there's only one caller, there's only one auth check — no bearer token, no
      `permissions` claims, nothing tenant-scoped-route-shaped. This is closer in spirit to
      tower's `/enrich` (SPIFFE-only, no session layered on top) than to any `permissions`-gated
      route in this design.

### Validation — different rigor for different origins, both enforced *here*

- [ ] **Server-side-originated events** (`analytics.request`, `analytics.auth.*` — portcullis's
      own direct dispatch, never touching the client-facing route) are trusted input — no size
      cap, no type-allowlist check beyond well-formedness. This is internal, SPIFFE-authenticated
      traffic from a service that already constructs these events correctly by construction.
- [ ] **Client-originated events** (`analytics.client.<eventType>`, forwarded through portcullis's
      local route) get the defenses ADR 0035 names explicitly, all enforced **by lookout, not
      portcullis** — "portcullis's job here is identity attachment and routing, not payload
      validation":
  - [ ] **Payload size cap** — a hard limit, rejected outright over it, not truncated.
  - [ ] **Allowlisted event types** — `eventType` must match a known, configured set; an
        unrecognized client-reported type is rejected (`400`), not silently forwarded to
        RabbitMQ as arbitrary free-form data.
  - [ ] **Rate limiting** — per the resource-protection instinct already applied elsewhere in
        this design (invite quotas, chronicle's own query endpoint) — scoped per tenant/
        application/`identityHash` where available, per source IP is explicitly **not** an
        option here, since IP is never captured anywhere in this pipeline (ADR 0035) and adding
        it just for rate-limiting purposes would violate the same rule it's trying to respect.
- [ ] **`identityHash` is the only identity field, ever** — never `accountId`, never resolved
      via a live call to anything. Present when a valid session existed at event time, entirely
      absent otherwise (not a null placeholder — the field is just missing).
- [ ] **No IP address is ever accepted, stored, or forwarded** — not truncated, not hashed, a
      hard, unconditional rule carried forward from ADR 0035, not re-litigated here.

### Publishing

- [ ] On successful validation, publishes to the **non-durable** RabbitMQ exchange/queue(s) ADR
      0035 established — accepted loss during a chronicle outage is a deliberate trade-off, not
      a reliability gap this story needs to close.
- [ ] Routing key matches the event-type taxonomy directly: `analytics.auth.<event>`,
      `analytics.request`, `analytics.client.<eventType>` — no separate routing-key mapping
      layer, the event's own `eventType` field **is** the routing key convention.
- [ ] Assigns a generated `eventId` to every published event (`node-flakes`, matching
      cross-service convention) — tracing/debugging only, not a dedup mechanism (this pipeline
      doesn't attempt dedup, ADR 0085).

---

## Not Covered Here

- Portcullis's own two dispatch paths (server-side fire-and-forget, the client-facing local
  route and its own request-shape) — already specified at the ADR level (ADR 0035); portcullis's
  own story covers the acceptance criteria for its side.
- Chronicle's consumption of what lookout publishes — [Chronicle Story 001](../chronicle/001-event-consumption.md).
- Sampling/granularity configuration — named as an open tunable in ADR 0035, not designed here
  or anywhere yet.

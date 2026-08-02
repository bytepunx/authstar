# ADR 0034: Herald's HTTP API Surface

- **Status:** Accepted (extended by [ADR 0049](0049-web-admin-information-architecture.md))
- **Date:** 2026-07-25
- **Affects:** herald, portcullis, web

> **Gap found and closed 2026-08-01:** ADR 0032 defined per-tenant sending config's *shape*
> (provider, addresses, credential) but no route ever existed for a tenant to actually set it up
> via `web`. Added below.

## Context

Herald's domain model (ADR 0022–0033) is settled; this lays out the actual routes `web` will
consume, following the same conventions established for tower (ADR 0030).

## Decision

### Auth model — same shape as tower, no separate operator tier

Herald sits behind portcullis as another prefix-routed upstream, exactly like tower. Requests
carry the portcullis-forwarded internal JWT; authorization is the `permissions` claims on it
(`communication-types:manage`, `communications:read`, `opt-outs:manage`, ...). Herald
independently verifies the JWT's signature on top of portcullis already having gated access —
defense in depth, same reasoning as tower. No operator/bearer-token tier — herald doesn't have
tower's bootstrap problem, so there's nothing that needs to bypass normal authorization.

The public `/unsubscribe` endpoints (ADR 0032) are the one exception — reached through
portcullis too (not separately exposed), just marked exempt (Story 003) on whatever routes to
herald, so portcullis stays the single ingress point for everything.

### Route inventory

**Communication types** (ADR 0025)

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/communication-types` | `GET`, `POST` | `POST` gated by `communication-types:manage` |
| `/tenants/{tenantSlug}/communication-types/{type}` | `GET`, `PATCH`, `DELETE` | `communicationType` gains `status: "active" \| "deprecated"` ([ADR 0053](0053-lifecycle-status-consolidation.md)) — historical `communication` records reference `type` and shouldn't become orphaned. `DELETE` is an alias for `PATCH { status: "deprecated" }` |

**Templates** (ADR 0025) — versioned, so editing means creating, not updating

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/communication-types/{type}/templates` | `GET`, `POST` | `POST` creates a new version — templates are immutable once created, no `PATCH`. Highest version number is implicitly current, no separate "activate" step, same convention as `kid`-based key rotation elsewhere in this design |
| `/tenants/{tenantSlug}/communication-types/{type}/templates/{version}` | `GET` | |

**Communications** (ADR 0025/0033) — the minimal audit record

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/communications` | `GET` | Cursor-paginated; filterable by `contactId`, `type`, `status`, date range |
| `/tenants/{tenantSlug}/communications/{id}` | `GET` | Minimal fields only — never decrypted content |
| `/tenants/{tenantSlug}/communications/{id}` | `PATCH` | `{ status: "pending" }` — manual retry (ADR 0033), same convention as `account.status` |
| `/tenants/{tenantSlug}/communications/{id}/render` | `GET` | On-demand decrypt + render (ADR 0025) — a `GET` on a legitimate sub-resource representation, not an action; narrowly permissioned given the sensitivity, same posture as `contacts:read` on tower |

**Opt-outs** (ADR 0022/0023/0024) — herald doesn't own `contact` (tower does, ADR 0023), so this
isn't nested under a `/contacts/` path; it's herald's own resource, keyed by the same
`contactId` hash

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/opt-outs/{contactId}` | `GET` | Current opted-out categories |
| `/tenants/{tenantSlug}/opt-outs/{contactId}/categories` | `POST` | Support-initiated opt-out (e.g. a phone request) |
| `/tenants/{tenantSlug}/opt-outs/{contactId}/categories/{category}` | `DELETE` | Re-subscribe, if legitimately requested |

**Sending configuration** (ADR 0032) — a per-tenant singleton, not a collection

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/sending-config` | `GET`, `PATCH` | `GET` never returns the credential field (write-only, same discipline as tower's provider `clientSecret`). `PATCH` (not `PUT` — stays consistent with this API's no-`PUT` convention, ADR 0030) accepts `provider`, `fromAddress`, `fromName`, `replyTo`, `physicalAddress`, and optionally `credential` to set/rotate it. Gated by `sending-config:manage` |

**Activity** (added by [ADR 0060](0060-activity-feed-and-revenue-summary.md))

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/activity` | `GET` | Same shared shape as tower's/keep's own activity routes. Gated by `activity:read` |

**Unsubscribe** (ADR 0032) — public, token-authenticated, not tenant/permission-gated

| Route | Method | Notes |
|---|---|---|
| `/unsubscribe` | `GET` | Confirmation landing page only — no side effect |
| `/unsubscribe` | `POST` | The actual action — RFC 8058 one-click or manual confirm |

## Consequences

- Herald's fastify routes should follow the same schema-first, swagger-generated approach as
  tower (ADR 0030) — same reasoning, same tooling.
- `web`'s eventual routing needs to reach both tower and herald behind portcullis, on whatever
  prefix scheme `web`'s own design settles on — not resolved here.

## Related

- [ADR 0030](0030-tower-api-surface.md) (conventions this follows), [ADR 0022](0022-herald-communications-service.md), [ADR 0025](0025-versioned-templates-and-encrypted-payloads.md), [ADR 0032](0032-per-tenant-sending-and-can-spam.md), [ADR 0033](0033-herald-send-worker-and-retry.md), [ADR 0052](0052-keep-herald-own-signet-access.md) (sending-config secret delivery mechanism), [ADR 0053](0053-lifecycle-status-consolidation.md) (`communicationType` status field)

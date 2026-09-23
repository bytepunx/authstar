# Story 010 — Activity Feed

**Epic:** Activity & Observability
**Repo:** tower
**Status:** Draft
**New — tower's side of the routes [ADR 0048](../../decisions/0048-steward-ux.md)/
[ADR 0060](../../decisions/0060-activity-feed-and-revenue-summary.md) already specify.**
Per [ADR 0021](../../decisions/0021-cli-operator-bootstrap.md),
[ADR 0048](../../decisions/0048-steward-ux.md),
[ADR 0060](../../decisions/0060-activity-feed-and-revenue-summary.md).
**Depends on:** [Story 001](001-actor-definitions.md)'s actor shapes;
[tech-stack.md](../../docs/tech-stack.md)'s `consequent` choice — this story leans directly on
its real `getEventStream` API.

---

## Summary

"Consequent's event-sourced actors already capture full history for free" (ADR 0048) — this
story is the read path that turns that raw event history into the shared
`{ timestamp, actorType, actorId, eventType, summary }` shape both the tenant-scoped and
operator-scoped activity routes return, no separate bookkeeping actor.

---

## Building the feed — grounded against `consequent`'s real `getEventStream`

`getEventStream(options)` takes one of three **mutually exclusive** selectors: `actorTypes`,
`actorIds`, or `actors` (a per-type `{ type: [ids] }` hash) — there is no built-in "filter by an
arbitrary field like `tenant`" option, so building one tenant's feed is a two-step process:

- [ ] **Discover this tenant's relevant actor ids per type.** For `application` and `provider`,
      this is free — already sitting in `tenant.applications`/`tenant.providers` (Story 001's
      `aggregateFrom`-embedded arrays), no query needed. For `account`, `roleDefinition`,
      `invite`, and `inviteCode`, each has `tenant` in its own `searchableBy` (Story 001) — a
      `find()` per type against the search adapter.
- [ ] **Call `getEventStream({ actors: { application: [...], provider: [...], account: [...],
      roleDefinition: [...], invite: [...], inviteCode: [...] }, sinceEventId or since, until,
      eventTypes })`** — one call covering every relevant type at once, already ordered.
- [ ] Map each event to `{ timestamp: event._createdOn, actorType: event._actorType, actorId:
      event._actorId, eventType: event.type, summary }` — `summary` is a short, human-readable
      string computed per `eventType` (e.g. `application.created` → `"Application '{name}'
      created"`, `account.role-granted` → `"Role '{name}' granted"`) — a lookup table of
      formatters keyed by event type, not a generic dump of the event's raw fields.
- [ ] Cursor-paginated per ADR 0030's convention, using `sinceEventId`/`until` directly as the
      pagination cursor — no separate offset scheme needed, `getEventStream` already orders by
      event id.

---

## Tenant-scoped route

### `GET /tenants/{tenantSlug}/activity`

- [ ] Gated by `activity:read` — deliberately coarse, one gate for the whole merged feed, not
      per-entry filtering (ADR 0060). Uses the mechanism above, scoped to this one tenant's
      discovered actor ids.
- [ ] Same shared response shape keep's and herald's own `/activity` routes already use (ADR
      0060) — a `web` client renders all three with one component, not three different parsers.

---

## Operator-scoped route

### `GET /operator/tenants/{tenantSlug}/activity`

- [ ] Bearer-token operator auth (ADR 0021), cross-tenant route tree — same handler as the
      tenant-scoped route above, reused via the same "operator tree wraps the same handler,
      different auth middleware" pattern ADR 0030 already established, not a separate
      implementation.
- [ ] **`actingAs` becomes a real, permanent part of the event record, not just a session-display
      artifact.** Every *mutating* operator-route request (grant/revoke, provider changes, invite
      issuance, etc.) requires an `X-Operator-Actor` header — `steward`'s own connect-time label,
      forwarded on every call it makes (ADR 0045/0048). Tower threads this value into the
      resulting event's own metadata (`event.actingAs`) at write time, alongside the standard
      `_initiatedBy`/`_initiatedById` fields `consequent` already attaches. This resolves an
      underspecified point in ADR 0048 ("entries include whatever 'acting as' label was
      supplied at connect time") into something concrete: the label is captured durably, on the
      historical record itself, not re-derived from `steward`'s current session at display time
      (which wouldn't even be possible for events written by a since-disconnected session).
      Read-only operator requests don't need the header — there's nothing to attribute.
  - [ ] A mutating operator request **without** the header is rejected (`400`) — attribution
        isn't optional for a shared-credential surface where it's the *only* accountability
        signal available (ADR 0045's own framing).
- [ ] Response includes `actingAs` per entry (falls back to `null`/omitted for entries predating
      this story, or for events the tenant-scoped route itself produced, which never carry it).

---

## Not Covered Here

- `GET /operator/tenants` (tenant search/list) and the rest of the operator API surface (admin
  access management, provider management, key rotation, stuck-erasure-requests view) — a
  separate future story, since they don't share this story's specific event-stream-construction
  concern.
- keep's and herald's own `/activity` implementations — their own stories, same shared response
  shape, not tower's concern beyond matching it.

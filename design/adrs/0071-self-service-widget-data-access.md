# ADR 0071: Self-Service Widget Data Access — the `/_authstar/me/*` Proxy Family

- **Status:** Accepted
- **Date:** 2026-08-01
- **Affects:** portcullis, tower, keep, web
- **Enables:** the embeddable Web Component inventory ([ADR 0072](0072-embeddable-web-component-inventory.md))

## Context

ADR 0044's embeddable widgets (account summary, subscription status, usage meter, invite
management, data export) are browser-side Custom Elements with no backend of their own — they
run inside whatever adopting application's page happens to host them. They need to fetch data
somehow, but a Shadow DOM widget has no credential to call tower or keep directly: the browser
only ever holds the authstar session cookie, and the internal JWT that credential resolves to
is generated and forwarded **server-side**, per request, by portcullis (Story 010) — it never
reaches the browser.

Three options exist: the widget calls tower/keep directly (impossible, no browser-held
credential for that); the widget calls the *host application's own backend*, which relays using
its own already-forwarded internal JWT (defeats the point — every adopter would need to
implement passthrough routes just to use a drop-in widget); or the widget calls back through
**portcullis**, on the same host it's already embedded in, reusing the exact session-cookie/gate
mechanism every other protected request already gets. The third is the only one that requires
zero backend work from an adopting application, and it's a direct extension of a pattern this
design already uses twice (`/_authstar/upgrade` and `/oauth2/select` proxying to `web`, ADR
0066; `/_authstar/usage` and `/_authstar/webhooks/stripe` proxying to `keep`, Stories 021/022).

## Decision

### `/_authstar/me/*` — a new reserved, protected path family, routed by prefix to the owning backend

Same-origin (the adopting application's own host, since portcullis fronts every application) —
no CORS needed, unlike ADR 0068's public signup page, which genuinely has no session yet. Every
path under this prefix requires a valid session (Story 013's ordinary gate, no special-casing)
and forwards the normal internal JWT (Story 010), exactly like any other protected proxied
request. Portcullis routes by prefix to whichever backend owns that data, over SPIFFE mTLS —
the same service-to-service pattern already used for tower/keep, no new addressing mechanism
introduced (tower and keep have never had an explicit `Upstream` bundle field the way `web`
does; this doesn't change that).

| Path | Backend | Notes |
|---|---|---|
| `/_authstar/me/account` | tower `GET /me/account` | |
| `/_authstar/me/identities`, `/_authstar/me/identities/{identityHash}` | tower `GET /me/identities`, `DELETE /me/identities/{identityHash}` | |
| `/_authstar/me/invite-codes` | tower `GET`/`POST /me/invite-codes` | |
| `/_authstar/me/subscription` | keep `GET /me/subscription` | |
| `/_authstar/me/export` | `web` `GET /me/export` | the one exception routed to `web`, not a backend service directly — see below |

### Tower and keep each gain their own `/me/*` route family — identity resolved from the forwarded JWT, no URL parameters

Generalizes what ADR 0056 already sketched narrowly for `/me/export` (`contactId` resolved "from
their already-authenticated identity") into the standard shape for **every** self-service
route: no `{tenantSlug}`/`{accountId}` path segments at all — tenant is implicit in which
tenant's key verified the internal JWT (unchanged, Story 010 carries no explicit `tenant`
claim), and `accountId` comes directly from the JWT's own `accountId` claim. This is a thin
resolution layer over the same underlying handlers the `{tenantSlug}`/`{accountId}`-explicit
tenant-scoped tree already has (ADR 0070's identities routes, in particular) — not a parallel
implementation.

- `GET /me/account` (tower) — **new**. Returns `{ status, grantedRoles, trialRoles,
  permissions, contactId }` plus the resolved `contact` join (`email`, `name`) — tower already
  holds plaintext contact data and already joins it for admin `contacts:read` access (ADR
  0030); doing the same join for the caller's own record needs no new mechanism, and no
  permission gate, following ADR 0070's self-action principle: you always know your own email.
- `GET`/`DELETE /me/identities[/{identityHash}]` (tower) — thin alias over ADR 0070's existing
  `{accountId}`-matches-caller routes; same last-identity lockout safeguard.
- `GET`/`POST /me/invite-codes` (tower) — `GET` filters to `issuedBy = caller's own accountId`
  (already supported — `inviteCode.searchableBy` already includes `issuedBy`, ADR 0019). `POST`
  is **still gated by the `invite:code:issue` permission** — unlike the routes above, issuing a
  code is an action with real system consequences (creates a redeemable grant), not a read of
  one's own data, so the self-action-needs-no-permission principle deliberately does **not**
  apply here. This is the concrete mechanism ADR 0051 flagged but didn't design: "the same
  tower endpoint... from inside the tenant's own product UI."
- `GET /me/subscription` (keep) — **new**. `{ status, planName, currentPeriodEnd }` for the
  caller's own `subscription` record (`scope: { account }`) — `planName` is resolved
  server-side by joining `subscription.stripePriceId` against `planMapping` (ADR 0038), sparing
  the widget a second lookup and keeping `stripePriceId` itself, an internal implementation
  detail, out of the response entirely. Keep had no accountId-scoped subscription read at all
  before this (`/accounts/{accountId}/customer` was the only accountId-scoped `GET` in its
  inventory) — this closes that gap.

### The usage-meter widget reads tower's materialized copy, not keep's — reuses `/me/account`, no new route

ADR 0054 already established that keep's `usage-records` list is reserved for the admin view
specifically to avoid showing two transiently-inconsistent numbers for the same thing — tower's
own materialized copy is "what actually drives internal-token claims" (ADR 0043). A
browser-facing usage widget should show the number that's actually being enforced, which means
reading the same `usage` shape (`[{ application, meter, periodUsage, periodLimit }]`) already on
the internal JWT (Story 010) — folded into `/me/account`'s response rather than a dedicated
route, since tower's view actor already materializes it from the same `entitlement.usage-
updated` events (ADR 0043).

### `/_authstar/me/export` is the one path routed to `web`, not a backend directly

Export is inherently multi-service (tower, keep, herald, chronicle) — `web` already owns exactly
this aggregation for the admin-facing export (ADR 0056), and duplicating that fan-out logic
behind a second, portcullis-side orchestrator would be redundant. Portcullis proxies this one
path to `web`'s existing `webUpstream` (ADR 0066), reusing the connection already established
for `/oauth2/select`/`/_authstar/upgrade` — `web` in turn implements `GET /me/export` exactly as
ADR 0056 already named it.

## Consequences

- New portcullis reserved path family, new story needed for the proxying mechanics (routing
  table, SPIFFE mTLS per backend).
- Tower gains a `/me/*` route family (`account`, `identities`, `invite-codes`).
- Keep gains a `/me/*` route family (`subscription`) — its first accountId-scoped subscription
  read.
- `web` implements `GET /me/export`, closing the gap ADR 0056 explicitly deferred.
- No new bundle fields — reuses the existing SPIFFE mTLS reach to tower/keep and the existing
  `webUpstream` field for `web`.

## Related

- [ADR 0019](0019-invite-codes.md), [ADR 0030](0030-tower-api-surface.md), [ADR 0038](0038-plan-mapping-and-subscription-tracking.md), [ADR 0041](0041-keep-api-surface.md), [ADR 0043](0043-application-reported-usage-metering.md), [ADR 0044](0044-web-surfaces-and-distribution-model.md), [ADR 0051](0051-web-applications-and-identity-access-screens.md), [ADR 0054](0054-web-billing-and-communications-screens.md), [ADR 0056](0056-gdpr-data-export.md), [ADR 0066](0066-portcullis-proxies-branded-pages-to-web.md), [ADR 0070](0070-self-service-identity-linking.md)

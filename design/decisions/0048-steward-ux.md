# ADR 0048: `steward`'s UX — Screens, Flows, and Two New Tower Endpoints

- **Status:** Accepted (extended by [ADR 0060](0060-activity-feed-and-revenue-summary.md))
- **Date:** 2026-08-01
- **Affects:** steward, tower

> **Extended 2026-08-01:** the tower activity route below is operator-scoped only. `web`'s
> Overview needed a tenant-scoped equivalent — and one from keep and herald too, not just tower
> — so ADR 0060 adds `GET /tenants/{tenantSlug}/activity` to all three, sharing the same
> response shape as the operator route here.
>
> **Extended 2026-08-01:** tenant creation, named below as out of scope, is resolved by
> [ADR 0067](0067-tenant-creation-and-provisioning.md)/
> [ADR 0068](0068-tenant-creation-ui-surfaces.md) — `steward` gains a Create Tenant screen
> calling tower's new pre-tenant `POST /tenants` route with the operator token.

## Context

`steward`'s functional surface is narrow, and stayed narrow after ADR 0046 removed its
keep-facing role entirely: tower's operator API (ADR 0021) is its only backend dependency,
covering exactly two things — admin access management and OIDC provider management, both for
tenants that already exist (tenant provisioning is explicitly out of scope, ADR 0021). The UI
should match that scope rather than grow into a general admin dashboard, and should reflect
`steward`'s port-forward-only, bearer-token reachability (ADR 0045) rather than pretend it's a
normal, bookmarkable web app.

## Decision

### Connect screen — token entry, not persisted, environment confirmation

On load, `steward` prompts for the operator bearer token and a **required** free-text "acting
as" label — not authentication (the shared operator-token, ADR 0045, can't distinguish
individuals), a client-enforced attribution nudge so activity shown later has *some* human
context attached rather than none. Required, not optional, since making it skippable would
undercut the only accountability signal available under a shared credential.

The token is held in memory for the tab's lifetime only — never `localStorage`, at most
`sessionStorage` — consistent with ADR 0045's deliberate-friction posture; a fresh port-forward
session means re-entering it. Once connected, `steward` confirms the token against tower and
displays which installation/environment it's talking to (surfaced from tower's own identity/
version info) — a safety measure against acting on the wrong installation when an operator
manages more than one.

### Tenant search — the real landing page

A search/browse of existing tenants, with a separate **Create Tenant** action alongside it
(added by [ADR 0067](0067-tenant-creation-and-provisioning.md)/
[ADR 0068](0068-tenant-creation-ui-surfaces.md)) rather than tenant creation being folded into
this flow — creation and lookup are different enough operator intents to stay as distinct
actions from the same landing page. Needs a **new tower operator route**: `GET /operator/tenants` (paginated,
searchable by slug/name) — the tenant-scoped API only ever exposed `GET /tenants/{tenantSlug}`
for one already-known tenant; nothing today lets an operator enumerate tenants at all. Selecting
a result enters that tenant's operator context.

Results show each tenant's current `status`, and a suspended tenant gets a **reactivate**
action (`PATCH { status: "active" }` via `operator/tenants/{tenantSlug}`) — added by
[ADR 0062](0062-tenant-status-enforcement-and-reactivation.md). This is the *only* path back
for a tenant that suspended itself, since suspension (by design) locks that tenant out of its
own `_admin`, the surface that would otherwise handle it.

### Tenant operator context — two sections, no sprawling nav

**Admin Access**
- Read: accounts holding any `permissions` grant for this tenant — lets an operator see who
  already has elevated access before granting more. Fetched via the existing
  `GET /tenants/{tenantSlug}/accounts` and filtered client-side for non-empty `permissions`
  (permission holders should be a small population — not worth a dedicated backend filter for
  this).
- **Recovery path**: grant/revoke `permissions` directly on an existing account — search by
  email (tower's account-list endpoint needs to support an `email` filter, resolved server-side
  via the `contact` HMAC lookup, ADR 0023 — not fully specified here, flagged as a needed
  addition if it doesn't already exist), select, add/remove permission grants.
- **Bootstrap path**: issue an elevated `invite` or `inviteCode` (ADR 0018/0019) — target email
  or code parameters, which `permissions` to grant on acceptance.

**OIDC Providers**
- Read: configured providers and their non-secret fields (`discoveryUrl`, `clientId`, `scope`).
- Add: full provider form including `clientSecret` — write-only, never redisplayed once saved
  (same discipline as every other secret in this design).
- Edit non-secret fields; rotate (not view) the secret; remove.

### Activity view — surfaces tower's existing audit trail, doesn't duplicate it

Consequent's event-sourced actors already capture full history for free. `steward` adds a
read-only recent-activity view per tenant (permission grants/revokes, invite/invite-code
issuance, provider changes) rather than inventing separate bookkeeping. Needs a **new tower
operator route**: `GET /operator/tenants/{tenantSlug}/activity`. Entries include whatever
"acting as" label was supplied at connect time — a real, stated limitation (self-reported
attribution, not verified identity), not a full audit solution, and displayed as such rather
than implied to be stronger than it is.

### Explicitly not designed here

- Any keep-facing functionality — removed by ADR 0046.
- Visual theming — `steward` deliberately does not use `web`'s Web-Component/CSS-custom-property
  system (ADR 0044); there is no tenant brand for an internal operator tool to match.

## Consequences

- Two new tower operator routes needed: `GET /operator/tenants` and
  `GET /operator/tenants/{tenantSlug}/activity` — not in ADR 0030's current inventory, flagged
  for a follow-up pass there.
- Tower's account-list endpoint may need an `email` search filter (server-side contact/HMAC
  resolved) if it doesn't already support one.
- `steward`'s UI is deliberately small: connect → tenant search → a two-section tenant context.
  No dashboard, no navigation beyond that.

## Related

- [ADR 0021](0021-cli-operator-bootstrap.md), [ADR 0023](0023-pii-isolation-via-hashed-contact-records.md), [ADR 0030](0030-tower-api-surface.md), [ADR 0044](0044-web-surfaces-and-distribution-model.md), [ADR 0045](0045-steward-operator-console.md), [ADR 0046](0046-tenant-owned-stripe-configuration.md), [ADR 0047](0047-application-and-role-slug-validation.md)

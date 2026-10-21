---
id: ADR-0030
title: Tower's HTTP API Surface
status: accepted
date: 2026-07-25
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0030: Tower's HTTP API Surface

- **Status:** Accepted
- **Date:** 2026-07-25
- **Affects:** tower, portcullis, web

## Context

Tower's domain model (ADR 0017–0029) is settled, but its actual API surface — the thing `web`
will consume and an OpenAPI spec will describe — was never laid out as a whole. This closes
that gap: general conventions, the two authentication models tower's endpoints sit behind, and
the full resource/route inventory.

## Decision

Conventions.

### Conventions

| Concern | Choice |
|---|---|
| Versioning | Media type via `Accept` header — see below, not the URL |
| Resource naming | Plural nouns, kebab-case in URLs (`/invite-codes`); camelCase in JSON bodies |
| Methods | `GET`/`POST`/`PATCH`/`DELETE` only — no `PUT`, nothing here needs full-replace |
| State transitions | Field-level `PATCH` — no verb segments in URLs; a state change is a partial update to the resource, same as any other field |
| Errors | RFC 7807 (`application/problem+json`) |
| Pagination | Cursor-based: `?limit=&cursor=`, response `{ data: [...], nextCursor }` |
| Idempotency | `Idempotency-Key` header on side-effecting `POST`s (invites, invite codes) — same discipline as herald (ADR 0022) |
| Cross-tenant access | 404, not 403 — don't confirm existence of a resource outside the caller's tenant |

### Versioning via `Accept`, not the URL

A URI identifies a resource, not a resource-at-a-particular-representation — baking a version
into the path conflates the two. Clients request a specific representation via content
negotiation instead:

```
Accept: application/vnd.authstar.v1+json
```

`GET /tenants/{tenantSlug}` is the same resource regardless of version; the `Accept` header
determines which representation comes back. A request with no version in `Accept` (or a bare
`application/json`) gets the latest version — tower's own first-party clients (`web`, the CLI)
always send an explicit version rather than relying on that default drifting under them.
Unversioned requests are answered but a request for a version tower no longer serves returns
`406 Not Acceptable`, not a guess at the closest match.

### Two authentication models, one route table

- **Tenant-scoped** (the normal path): tower sits behind portcullis like any other upstream.
  Admins authenticate through the ordinary OIDC flow; authorization is the `permissions` claims
  on the internal JWT portcullis forwards (ADR 0018/0019/0021). Every tenant-scoped route
  enforces that the URL's `{tenantSlug}` matches the caller's own tenant.
- **Operator** (ADR 0021): bearer-token-gated, cross-tenant, reusing the **same route handlers**
  under `/operator/...` — no parallel vocabulary. The only differences are the auth
  middleware and the removal of the same-tenant restriction. Two routes exist **only** under
  this tree, with no tenant-scoped equivalent, added by
  [ADR 0048](0048-steward-ux.md): `GET /operator/tenants` (search/list — nothing in the
  tenant-scoped tree lets a caller enumerate tenants, since a tenant-scoped caller already knows
  its own slug) and `GET /operator/tenants/{tenantSlug}/activity` (read-only recent-activity
  view, surfacing consequent's existing per-actor event history for `steward`'s UI).
- **Portcullis → tower** (enrichment, login-time identity resolution; [ADR 0070](0070-self-service-identity-linking.md)'s
  `POST /identity-links`; and [ADR 0073](0073-provider-discovery-status-feedback.md)'s
  `POST /provider-discovery-status`): SPIFFE mTLS, service-to-service — not a signet-delivered
  bearer token. Tower still independently verifies the internal JWT's own signature on top of
  the mTLS identity check where a session is involved (defense in depth) — `provider-discovery-status`
  carries no session at all, purely a service-identity-authenticated report.

### Route inventory

**Tenants**

| Route | Method | Notes |
|---|---|---|
| `/tenants` | `POST` | **Not** on this tenant-scoped/operator route tree at all — a third, pre-tenant auth model living on tower's own direct ingress, outside portcullis entirely. Unauthenticated when the installation's `selfServiceEnabled` flag is on, or operator-bearer-token authenticated (via `steward`) always. See [ADR 0067](0067-tenant-creation-and-provisioning.md)/[ADR 0068](0068-tenant-creation-ui-surfaces.md) |
| `/tenants/{tenantSlug}` | `GET` | Non-secret fields only |
| `/tenants/{tenantSlug}` | `PATCH` | `name`, `cookie`; `status` accepts **only** `active → suspended` through this route ([ADR 0062](0062-tenant-status-enforcement-and-reactivation.md)) — reactivation and deletion are structurally unreachable here, operator-only via `steward`. Gated by `tenant:manage` |
| `/tenants/{tenantSlug}/providers` | `GET`, `POST` | `POST` gated by `providers:manage`; secret write triggers the signet push (ADR 0020) |
| `/tenants/{tenantSlug}/providers/{name}` | `GET`, `PATCH`, `DELETE` | `DELETE` is an alias for `PATCH { status: "removed" }` ([ADR 0053](0053-lifecycle-status-consolidation.md)) — `provider` gains a `status: "active" \| "removed"` field. Tower synchronously checks no active application's `exposedProviders` still references it before allowing removal, **and** refuses if it would leave zero providers exposed by `_admin` ([ADR 0067](0067-tenant-creation-and-provisioning.md)). `GET` also returns `discoveryStatus: { status, checkedAt, error }` ([ADR 0073](0073-provider-discovery-status-feedback.md)) |
| `/provider-discovery-status` | `POST` | Portcullis-mTLS-only, no tenant-scoped equivalent — reports a discovery status transition ([ADR 0073](0073-provider-discovery-status-feedback.md)) |

**Applications** (ADR 0016)

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/applications` | `GET`, `POST` | Gated by `applications:manage` |
| `/tenants/{tenantSlug}/applications/{appSlug}` | `GET`, `PATCH`, `DELETE` | `DELETE` is a soft alias for `PATCH { status: "deleted" }` ([ADR 0051](0051-web-applications-and-identity-access-screens.md)) — not a row removal, consistent with `account`/`tenant`. `PATCH` also validates `publicUrl`'s host is present in `hosts` |

**Accounts** (ADR 0017/0018)

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/accounts` | `GET` | Search via `account`'s `searchableBy` (ADR 0017) |
| `/tenants/{tenantSlug}/accounts/{accountId}` | `GET`, `PATCH` | `PATCH { status: "active" \| "suspended" \| "deleted" }` covers suspend/reactivate/business-offboarding — no separate action endpoints. `deleted` here is a business status field, not resource removal; **distinct from GDPR erasure** (below), which operates on `contact`, not `account`, and can happen independently of this |
| `/tenants/{tenantSlug}/accounts/{accountId}/roles` | `GET`, `POST` | `roles` (ADR 0017), app-interpreted claims. `POST` validates `(name, scope)` against an active `roleDefinition` ([ADR 0047](0047-application-and-role-slug-validation.md)) before granting |
| `/tenants/{tenantSlug}/accounts/{accountId}/roles/{name}` | `DELETE` | Scope disambiguated via query param if needed |
| `/tenants/{tenantSlug}/accounts/{accountId}/permissions` | `GET`, `POST` | `permissions` (ADR 0018), tower-owned, distinct vocabulary from `roles` |
| `/tenants/{tenantSlug}/accounts/{accountId}/permissions/{grant}` | `DELETE` | |
| `/tenants/{tenantSlug}/accounts/{accountId}/identities` | `GET` | `{ idp }` per linked identity — self, or an admin holding `accounts:manage` ([ADR 0070](0070-self-service-identity-linking.md)) |
| `/tenants/{tenantSlug}/accounts/{accountId}/identities/{identityHash}` | `DELETE` | Self, or `accounts:manage`; refuses if it would remove the account's last identity ([ADR 0070](0070-self-service-identity-linking.md)) |

No `POST /accounts` — accounts are created only via identity resolution (OIDC login) or invite
acceptance, never directly through this API, since a direct-create would bypass identity
resolution entirely.

**Self-action needs no `permissions` grant** ([ADR 0070](0070-self-service-identity-linking.md)):
any tenant-scoped account route where `{accountId}` matches the caller's own resolved
`accountId` is permitted without holding any grant — only acting on a *different* account
requires one. Applies to the identities routes above and to any future self-service account
*read* or account-*hygiene* action (linked identities, own contact/email).

> **Corrected 2026-08-05 ([tower Story 005](../stories/tower/005-accounts-roles-and-permissions.md)):**
> this exemption **never** applies to `POST`/`DELETE` on `/accounts/{accountId}/roles` or
> `/accounts/{accountId}/permissions`, self or not — granting or revoking your own roles or
> permissions is a privilege-escalation action, not a data read or hygiene action, and always
> requires the same `roles:manage`/`permissions:manage` grant an admin acting on someone else
> would need. The phrasing above ("any future self-service account action") was written broadly
> enough to be misread as covering these too; this correction exists specifically to close that
> reading before it gets implemented that way. `invite:code:issue`'s existing carve-out
> (ADR 0071 — "issuing is an action with real system consequences... the self-action exemption
> does **not** apply here") is the same reasoning, applied here explicitly rather than left to
> be inferred by analogy.

**Self-service** (added by [ADR 0071](0071-self-service-widget-data-access.md)) — a separate
`/me/*` family, no `{tenantSlug}`/`{accountId}` segments at all; identity resolved entirely
from the forwarded internal JWT, a thin layer over the tenant-scoped handlers above

| Route | Method | Notes |
|---|---|---|
| `/me/account` | `GET` | `{ status, grantedRoles, trialRoles, permissions, contactId, email, name, usage }` — includes the plaintext `contact` join (no `contacts:read` gate needed for one's own record) and the same materialized `usage` shape carried on the internal JWT (ADR 0043) |
| `/me/identities`, `/me/identities/{identityHash}` | `GET`, `DELETE` | Alias over the `{accountId}`-matches-caller identities routes above |
| `/me/invite-codes` | `GET`, `POST` | `GET` filters to `issuedBy` = caller; `POST` still gated by `invite:code:issue` — issuing is an action with real consequences, not a data read, so the self-action exemption does **not** apply here |

Reached via portcullis's `/_authstar/me/*` (Story 025), never called directly by a browser.

**Role definitions** (added by [ADR 0047](0047-application-and-role-slug-validation.md)) — the
catalog of valid `(name, scope)` role values grantable within the tenant; must exist before a
role can be granted anywhere (accounts, invites, invite codes, `keep`'s plan mappings)

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/role-definitions` | `GET`, `POST` | `POST` gated by `roles:manage`; validates `scope.application` exists if application-scoped |
| `/tenants/{tenantSlug}/role-definitions/{id}` | `GET`, `PATCH`, `DELETE` | `DELETE` retires (`status: retired`), does not remove — existing grants of an already-retired role stay intact |

**Contacts** (ADR 0023) — narrowly permissioned given the sensitivity of what this exposes

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/contacts` | `GET` | Single-result lookup by `?email=...` only — tower resolves the HMAC internally (ADR 0023/0055). **Deliberately not a browse/list endpoint** — bulk access to plaintext PII is a bigger exposure surface than the actual use case (always "someone gave us an email"), never needed |
| `/tenants/{tenantSlug}/contacts/{contactId}` | `GET` | Returns plaintext email/name plus a linked-account preview (status/roles/tenure, resolved via `account.contactId`) — gated by a narrow `contacts:read` permission, itself worth auditing given the sensitivity (same posture as herald's on-call viewer, ADR 0025) |
| `/tenants/{tenantSlug}/contacts/{contactId}` | `PATCH` | `name` only — `email` stays immutable (repoint-only, ADR 0023), since only `email` feeds the `contactId` hash |
| `/tenants/{tenantSlug}/contacts/{contactId}` | `DELETE` | **This is the erasure trigger** — deletes the `contact` row and kicks off the cascade (ADR 0026). Gated by `contacts:erase`, **not** `contacts:read` — found missing and added by [ADR 0051](0051-web-applications-and-identity-access-screens.md)'s catalog correction; triggering an irreversible cross-service cascade is a materially different consequence than viewing a name and email |
| `/tenants/{tenantSlug}/accounts/{accountId}/change-email` | `POST` | Not a `PATCH` — repoints `account.contactId` to a new/reused `contact`, doesn't mutate the old one in place ([ADR 0076](0076-admin-initiated-email-change.md)). Gated by `accounts:manage` |

**Erasure requests** (ADR 0026) — read-only, for compliance verification

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/erasure-requests` | `GET` | List, paginated, filterable by status/date range — the actual audit-verification path (ADR 0055); gated by `erasure-requests:read`, deliberately narrower than `contacts:read` since these records carry no PII |
| `/tenants/{tenantSlug}/erasure-requests/{contactId}` | `GET` | Status, `acknowledgedBy`, and `expectedServices` (ADR 0055) — proof-of-completion record |

**Activity** (added by [ADR 0060](0060-activity-feed-and-revenue-summary.md)) — tenant-scoped
counterpart to the operator-scoped route added in ADR 0048, same shared response shape

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/activity` | `GET` | Paginated; `{ timestamp, actorType, actorId, eventType, summary }` entries. Gated by `activity:read` |

**Invites** (ADR 0018)

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/invites` | `GET`, `POST` | `POST` gated by `invite:send`; each entry in the invite's `roles` list is validated against an active `roleDefinition` at creation time, not redemption time (ADR 0047) |
| `/tenants/{tenantSlug}/invites/{token}` | `GET`, `PATCH`, `DELETE` | `PATCH { status: "revoked" }` is the actual mechanism; `DELETE` is an alias ([ADR 0053](0053-lifecycle-status-consolidation.md)) |

Redemption is **not** a `web`-facing endpoint on this surface — it's triggered internally as
part of the OIDC login flow (Story 006) when a token is carried through the flow, not something
an admin or the invitee calls directly.

**Invite codes** (ADR 0019)

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/invite-codes` | `GET`, `POST` | `POST` gated by `invite:code:issue` — note this permission is **not** admin-exclusive (ADR 0019); a regular account can legitimately call this if granted the scoped permission. `roles` validated against an active `roleDefinition` at creation time, same as invites (ADR 0047) |
| `/tenants/{tenantSlug}/invite-codes/{code}` | `GET`, `PATCH`, `DELETE` | `PATCH { status: "revoked" }` is the actual mechanism; `DELETE` is an alias ([ADR 0053](0053-lifecycle-status-consolidation.md)) |

### Implementation recommendation: schema-first with fastify, not a hand-maintained spec

Define each route's request/response with fastify's JSON-schema-per-route, and generate the
OpenAPI document from that (`@fastify/swagger` or equivalent) rather than hand-authoring a
separate spec that can drift from the actual implementation. This also gives request validation
for free from the same schemas used to generate documentation — directly serving the
"easier to test" half of the original ask, not just the OpenAPI half.

## Consequences

- Portcullis needs a SPIFFE-mTLS client path for calling tower (enrichment, login-time identity
  resolution) — not yet reflected in the portcullis stories, worth a follow-up pass.
- Tower's fastify routes should be organized to share handler logic between the tenant-scoped
  and operator route trees, differing only in the auth middleware layer.
- `web`'s eventual design consumes this surface directly — the generated OpenAPI document is
  what it should be built against.

## Related

- [ADR 0017](0017-account-identity-and-role-model.md), [ADR 0018](0018-trial-roles-and-keep-boundary.md), [ADR 0019](0019-invite-codes.md), [ADR 0020](0020-tenant-application-actors-and-secret-handling.md), [ADR 0021](0021-cli-operator-bootstrap.md), [ADR 0023](0023-pii-isolation-via-hashed-contact-records.md), [ADR 0026](0026-erasure-cascade.md), [ADR 0047](0047-application-and-role-slug-validation.md), [ADR 0048](0048-steward-ux.md), [ADR 0051](0051-web-applications-and-identity-access-screens.md) (permissions catalog consolidated, `roleDefinition` route `{id}` clarified, `application`/`account` route corrections), [ADR 0053](0053-lifecycle-status-consolidation.md) (`provider`/`invite`/`inviteCode` `DELETE`-vs-`PATCH` corrections), [ADR 0055](0055-web-privacy-compliance-screens.md) (contacts email search/`PATCH`, erasure-requests list), [ADR 0062](0062-tenant-status-enforcement-and-reactivation.md) (`tenant` `PATCH` route, restricted status transition), [ADR 0067](0067-tenant-creation-and-provisioning.md) (`POST /tenants`, pre-tenant direct ingress, provider-removal safeguard), [ADR 0070](0070-self-service-identity-linking.md) (`POST /identity-links`, self-service identities routes, self-action-needs-no-permission principle), [ADR 0071](0071-self-service-widget-data-access.md) (`/me/*` family), [ADR 0073](0073-provider-discovery-status-feedback.md) (`POST /provider-discovery-status`, `discoveryStatus` field), [ADR 0076](0076-admin-initiated-email-change.md) (`POST /accounts/{accountId}/change-email`)

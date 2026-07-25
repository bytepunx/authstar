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
  middleware and the removal of the same-tenant restriction.
- **Portcullis → tower** (enrichment, login-time identity resolution): SPIFFE mTLS,
  service-to-service — not a signet-delivered bearer token. Tower still independently verifies
  the internal JWT's own signature on top of the mTLS identity check (defense in depth).

### Route inventory

**Tenants**

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}` | `GET` | Non-secret fields only |
| `/tenants/{tenantSlug}/providers` | `GET`, `POST` | `POST` gated by `providers:manage`; secret write triggers the signet push (ADR 0020) |
| `/tenants/{tenantSlug}/providers/{name}` | `GET`, `PATCH`, `DELETE` | |

Tenant *creation* is deliberately absent — still an open question per ADR 0021, not designed
here.

**Applications** (ADR 0016)

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/applications` | `GET`, `POST` | Gated by `applications:manage` |
| `/tenants/{tenantSlug}/applications/{appSlug}` | `GET`, `PATCH`, `DELETE` | |

**Accounts** (ADR 0017/0018)

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/accounts` | `GET` | Search via `account`'s `searchableBy` (ADR 0017) |
| `/tenants/{tenantSlug}/accounts/{accountId}` | `GET`, `PATCH` | `PATCH { status: "active" \| "suspended" \| "deleted" }` covers suspend/reactivate/business-offboarding — no separate action endpoints. `deleted` here is a business status field, not resource removal; **distinct from GDPR erasure** (below), which operates on `contact`, not `account`, and can happen independently of this |
| `/tenants/{tenantSlug}/accounts/{accountId}/roles` | `GET`, `POST` | `roles` (ADR 0017), app-interpreted claims |
| `/tenants/{tenantSlug}/accounts/{accountId}/roles/{name}` | `DELETE` | Scope disambiguated via query param if needed |
| `/tenants/{tenantSlug}/accounts/{accountId}/permissions` | `GET`, `POST` | `permissions` (ADR 0018), tower-owned, distinct vocabulary from `roles` |
| `/tenants/{tenantSlug}/accounts/{accountId}/permissions/{grant}` | `DELETE` | |

No `POST /accounts` — accounts are created only via identity resolution (OIDC login) or invite
acceptance, never directly through this API, since a direct-create would bypass identity
resolution entirely.

**Contacts** (ADR 0023) — narrowly permissioned given the sensitivity of what this exposes

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/contacts/{contactId}` | `GET` | Returns plaintext email/name — gated by a narrow `contacts:read` permission, itself worth auditing given the sensitivity (same posture as herald's on-call viewer, ADR 0025) |
| `/tenants/{tenantSlug}/contacts/{contactId}` | `DELETE` | **This is the erasure trigger** — deletes the `contact` row and kicks off the cascade (ADR 0026) |

**Erasure requests** (ADR 0026) — read-only, for compliance verification

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/erasure-requests/{contactId}` | `GET` | Status + `acknowledgedBy` — proof-of-completion record |

**Invites** (ADR 0018)

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/invites` | `GET`, `POST` | `POST` gated by `invite:send` |
| `/tenants/{tenantSlug}/invites/{token}` | `GET`, `DELETE` | `DELETE` = revoke |

Redemption is **not** a `web`-facing endpoint on this surface — it's triggered internally as
part of the OIDC login flow (Story 006) when a token is carried through the flow, not something
an admin or the invitee calls directly.

**Invite codes** (ADR 0019)

| Route | Method | Notes |
|---|---|---|
| `/tenants/{tenantSlug}/invite-codes` | `GET`, `POST` | `POST` gated by `invite:code:issue` — note this permission is **not** admin-exclusive (ADR 0019); a regular account can legitimately call this if granted the scoped permission |
| `/tenants/{tenantSlug}/invite-codes/{code}` | `GET`, `DELETE` | `DELETE` = revoke |

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

- [ADR 0017](0017-account-identity-and-role-model.md), [ADR 0018](0018-trial-roles-and-keep-boundary.md), [ADR 0019](0019-invite-codes.md), [ADR 0020](0020-tenant-application-actors-and-secret-handling.md), [ADR 0021](0021-cli-operator-bootstrap.md), [ADR 0023](0023-pii-isolation-via-hashed-contact-records.md), [ADR 0026](0026-erasure-cascade.md)

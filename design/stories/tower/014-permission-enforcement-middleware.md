# Story 014 — Permission Enforcement Middleware

**Epic:** Authorization
**Repo:** tower
**Status:** Draft
**New — every prior tower story assumes this exists and none of them specify it.** Per
[ADR 0017](../../decisions/0017-account-identity-and-role-model.md),
[ADR 0018](../../decisions/0018-trial-roles-and-keep-boundary.md),
[ADR 0030](../../decisions/0030-tower-api-surface.md),
[ADR 0051](../../decisions/0051-web-applications-and-identity-access-screens.md),
[ADR 0070](../../decisions/0070-self-service-identity-linking.md),
[ADR 0086](../../decisions/0086-jwks-endpoint-for-internal-jwt-verification.md),
[ADR 0087](../../decisions/0087-jwks-response-includes-pem-alongside-jwk-point.md).
**Depends on:** [Story 002](002-claims-enrichment-endpoint.md)'s `permissions` field on the
internal JWT (only real as of `bytepunx/authstar-portcullis` commit `a16ffad` — every route
story written before that landed assumed the claim would eventually exist, not that it already
did).

---

## The gap this closes

Every tenant-scoped route story in this repo (004 through 013) opens its write/sensitive-read
routes with a line like "Gated by `billing:manage`" or "Gated by `applications:manage`" — but
none of them specify the actual mechanism that check runs through. As of this writing, `jose`
is a listed dependency and is never imported anywhere in `src/` — there is no code path that
reads an internal JWT at all, let alone checks a permission on it. Every tenant-scoped route in
this repo is currently reachable with no authorization check whatsoever. This story is that
missing mechanism, written once, for every route to share.

This is deliberately separate from the **operator** bearer-token check ([Story 013](013-operator-api.md),
`isOperatorRequest`) — that's a different, already-real mechanism (one shared installation
secret, no per-tenant key, no `permissions` claim involved). This story covers only the
tenant-scoped tree, where `permissions` is the actual authorization boundary (ADR 0030:
*"authorization is the `permissions` claims on the internal JWT portcullis forwards"*).

---

## Mechanism

- [ ] A Fastify `preHandler`, parameterized by the grant it requires (e.g.
      `requirePermission('billing:manage')`), applied per-route — not a blanket
      all-routes-behind-one-check, since different routes need different grants and a few
      (health checks, `/enrich`, `/identities/resolve` — already SPIFFE-mTLS-only) need none at
      all.
- [ ] Extracts the internal JWT from `Authorization: Bearer` and verifies it with
      `@bytepunx/authstar-fastify` (already built, tested, and CI-green in
      `bytepunx/authstar-clients` — **not yet published to npm**, which blocks actually
      installing it; see Notes) rather than hand-rolling verification a second time in this
      repo. Portcullis attaches this header on every proxied, authenticated request (Story
      010); a request reaching tower with no such header, or one that fails verification, is
      treated identically to a missing grant — a 403, not a 401, matching this design's existing
      posture of not distinguishing "no session" from "wrong permission" this deep in the stack.
- [ ] `enrichmentStatus: "degraded"` tokens are treated as carrying **no** permissions,
      regardless of what the token's `permissions` array actually contains (portcullis never
      fabricates grants for a degraded token, but this middleware must not trust an empty array
      as "correctly checked and denied" either — the same posture `web`'s own
      `verifyInternalJwt` already implements, ported here rather than reinvented).
- [ ] `requirePermission(grant)` passes if `claims.permissions.includes(grant)`, **or** if the
      route is one of the narrow self-action exemptions ADR 0070 names (any tenant-scoped
      account route where the URL's `{accountId}` equals the caller's own resolved `accountId`)
      — implemented as an explicit allowlist of (route, method) pairs the exemption applies to,
      not a blanket "any self-action skips the check," per
      [ADR 0030](../../decisions/0030-tower-api-surface.md)'s own correction that
      `roles`/`permissions` grant-or-revoke actions on one's own account are **never**
      self-action-exempt even though most other self-reads are.
- [ ] Failure is a `403` with a generic body (no detail on which grant was required) — matching
      `Deny`'s own posture elsewhere in this design (Story 010: reason is server-side-log-only).

---

## Open question this story does not resolve — flagged, not silently assumed

**How does a request reaching tower even know which tenant's JWKS to verify against?**
Portcullis resolves tenant by `Host` (ADR 0002) and portcullis's own JWKS endpoint is
`Host`-scoped the same way (ADR 0086). Tower is not reached by a tenant's own branded host —
it's one shared deployment (`tower.authstar.svc.cluster.local` or equivalent), reached the same
way regardless of which tenant a request is for. Something has to carry the tenant slug on the
proxied request so tower can construct `https://<tenant-host>/.well-known/jwks.json` (or
however it's meant to look it up) per request.

`web`'s own code already assumes a `x-authstar-tenant` header for exactly this purpose (see
`web/src/lib/server/hooks.server.ts`'s own comment: *"this repo's own documented header-name
assumption"*) — but a full search of this design repo turns up **zero** ADRs or stories that
actually specify that header, who sets it (presumably portcullis, forwarding the tenant it
already resolved from `Host`), or its exact name/shape. `web` invented it locally rather than
finding it specified anywhere.

This needs a decision — almost certainly a short ADR — before this story's JWKS-resolution step
can be implemented for real, rather than every service (web already, tower/keep/herald next)
independently guessing the same header name and hoping they agree. Tracked as a prerequisite,
not resolved here.

---

## Route → permission mapping

Pulled directly from the canonical catalog [ADR 0051](../../decisions/0051-web-applications-and-identity-access-screens.md)
consolidated, and from each route's own story — not reinvented here:

| Route family | Grant | Story |
|---|---|---|
| Applications CRUD | `applications:manage` | [004](004-applications-and-providers.md) |
| Providers CRUD | `providers:manage` | [004](004-applications-and-providers.md) |
| Accounts list/detail/status | `accounts:manage` | [005](005-accounts-roles-and-permissions.md) |
| Role grants | `roles:manage` | [005](005-accounts-roles-and-permissions.md) |
| Permission grants | `permissions:manage` | [005](005-accounts-roles-and-permissions.md) |
| Role definitions CRUD | `roles:manage` | [006](006-role-definitions.md) |
| Invite issuance | `invite:send` | [007](007-invites-and-invite-codes.md) |
| Invite-code issuance | `invite:code:issue` | [007](007-invites-and-invite-codes.md) |
| Contact read | `contacts:read` | [008](008-contacts-erasure-and-export.md) |
| Contact erasure | `contacts:erase` | [008](008-contacts-erasure-and-export.md) |
| Contact export | `contacts:export` | [008](008-contacts-erasure-and-export.md) |
| Erasure-requests list | `erasure-requests:read` | [008](008-contacts-erasure-and-export.md) |
| Activity feed | `activity:read` | [010](010-activity-feed.md) |
| Tenant settings edit | `tenant:manage` | [011](011-tenant-management-and-key-rotation.md) |

`/me/*` (Story 009) and `/enrich`/`/identities/resolve` (Stories 002/003) are deliberately
**not** in this table — the former authorizes by "is this the caller's own record," the latter
by SPIFFE mTLS alone, neither by a `permissions` grant.

---

## Not Covered Here

- The operator bearer-token mechanism ([Story 013](013-operator-api.md)) — already real,
  unrelated to this story.
- The tenant-JWKS-resolution question above — a real prerequisite, not resolved by this story.
- `keep` and `herald` need the identical mechanism applied to their own routes — covered by
  their own stories ([keep Story 007](../keep/007-permission-enforcement-middleware.md),
  [herald Story 006](../herald/006-permission-enforcement-middleware.md)), not repeated here.

## Notes

- `@bytepunx/authstar-core`/`@bytepunx/authstar-fastify` (from `bytepunx/authstar-clients`)
  exist, are tested, and are CI-green as of this writing, but are **not yet published to npm**
  — publishing them (mirroring the `@bytepunx/signet-client` publish-on-release-please-merge
  flow already established) is a real prerequisite to wiring this up, not just an implementation
  detail.

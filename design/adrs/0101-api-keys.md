---
id: ADR-0101
title: API Keys — User-Scoped and Org-Scoped, Tenant-Plan-Gated
status: accepted
date: 2026-08-30
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0101: API Keys — User-Scoped and Org-Scoped, Tenant-Plan-Gated

- **Status:** Accepted
- **Date:** 2026-08-30
- **Affects:** tower, keep, portcullis, authstar-clients, web
- **Related:** [ADR 0079](0079-batched-usage-reporting-credentials.md) (superseded in spirit, not in
  fact — its narrow usage-reporting credential still exists unchanged for its own purpose), [ADR
  0100](0100-organization-membership-and-open-role-catalog.md) (the role-catalog and organization
  membership mechanisms this decision reuses), [ADR 0069](0069-role-interpretation-is-application-owned.md)
  (the open-role-vocabulary precedent `api-keys:manage` extends into a new scope kind), [ADR
  0015](0015-exempt-routes-never-blocked.md) (the session-path fail-open posture this
  decision's own credential path deliberately does not adopt — see Decision below)

## Context

Tenant applications need a way to let their own users — and organizations — mint long-lived,
programmatic credentials for machine/API access, distinct from the interactive browser-session
login flow authstar already provides. Today authstar has no general-purpose API key mechanism at
all: the closest thing, `usageReportingCredential` (ADR 0079, implemented in `keep`), is explicitly
scoped to one narrow purpose (an application backend reporting usage records to keep) and
explicitly disclaims being a general API key.

Building a real one surfaces genuine architectural gaps worth closing deliberately: portcullis has
never had a second credential-verification path alongside session cookies, the platform has no
rate-limiting infrastructure anywhere, and application-scope roles have never auto-seeded a
protected, authstar-interpreted default the way ADR 0100's four organization roles do at the
organization scope.

## Decision

An account or an organization (acting through one of its managers) can mint a named API key
scoped to a **subset of roles it currently holds for one specific application**, shown once at
creation, never editable after. The ability to do this at all — plus how many keys are allowed and
what rate limit applies — is gated by a new protected, application-scope role
(`api-keys:manage`), granted the same way any other app-scoped role already is: directly, or via a
tenant's plan-mapping entitlement pipeline (mirroring `seatLimit`). `authstar/web` renders every UI
surface for this so tenant applications never build their own.

### `api-keys:manage` — the first *application*-scope auto-seeded protected role

ADR 0100 established four baked-in, protected, auto-seeded **organization**-scope roles
(`manager`/`member`/`billingAdmin`/`billingViewer`), seeded once per *tenant* at *provisioning*
time. `api-keys:manage` is the first such role at **application** scope, seeded per *application*
at application-*creation* time (`tower/src/routes/applications.ts`'s `createApplication`) — plus a
one-time, idempotent, operator-only backfill route
(`POST /operator/tenants/:tenantSlug/applications/backfill-api-keys-manage-role`) for applications
that predate this feature, since standing up a full standalone bootstrap script just to seed one
role definition wasn't worth the ceremony.

This is a role, not a `PERMISSION_CATALOG` entry (ADR 0069) — the "grantable permission" framing in
the driving request means a grantable *capability* within one application, not one of tower's own
closed tenant-staff/admin concerns. Because it's a role, granting the capability to an individual
account or an organization needs **no new keep code** — the existing app-scoped-role-grant and
plan-mapping-`grantedRoles`-fan-out mechanisms already do it; only the numeric key-count limit and
rate-limit config are genuinely new entitlement plumbing (below).

### Key shape, format, and secret storage

`authstar_{apiKeyId}_{secret}` — `apiKeyId` is the new `apiKey` actor's own flake id (an O(1)
`fetch`, no scan needed), `secret` is `randomBytes(32)` base64url. Hashed at rest as
`sha256(salt:secret)` with **a random salt generated per key**, stored alongside the hash — a
deliberate improvement over `keep`'s usage-reporting credential (ADR 0079), which hashes with one
static, deployment-wide salt, an explicitly-flagged shortcut in that code. A non-secret
`secretPreview` (the last 4 characters) is stored alongside for list-view display.

`ApiKeyState.grantedRoles` is plain role-name strings, not account's own `RoleGrant {name, scope}`
shape — a key is already pinned to exactly one `application` (the actor's own field), so a
per-role scope wrapper would be redundant, and normalizing to strings lets the create-time subset
check and the verify-time re-intersection (below) both work identically regardless of whether the
owner is an account or an organization, which store their own granted roles in two genuinely
different shapes (`account.grantedRoles: {name, scope}[]` vs. `organization.grantedRoles:
{application, role}[]`).

### Owner shape: `{account}` or `{organization}`, flattened for search

`owner: {account: id} | {organization: id}`, flattened into nullable `ownerAccountId`/
`ownerOrganizationId` scalar fields in `searchableBy` — a deliberate departure from `keep`'s
`customer_actor`'s un-flattened `Scope`, justified because "list my/our keys" is this feature's
primary, frequent operation, not a rare one a full-tenant scan-and-filter can absorb.

Creating an org-owned key requires the caller to hold the org's `manager` role
(`requireOrganizationManager`) **and** the org to currently hold `api-keys:manage` for that
application; requested roles are validated as a subset of the org's own `grantedRoles` for that
app. A personal key requires the caller's own `account.grantedRoles` to include `api-keys:manage`
for that app; requested roles are a subset of the caller's own granted roles for that app.

### Live re-intersection at verify time, not just at creation time

A key's `grantedRoles` (chosen once, at creation, immutable — no `update` command exists on the
`apiKey` actor at all) is never returned directly by `POST /verify-api-key`. The response's
`grantedRoles` is always `effectiveRoles = intersect(apiKey.grantedRoles,
currentOwnerRolesForApplication)`, recomputed fresh on every call. If an org's plan lapses and a
granted role disappears, or an account's role is revoked directly, any API key that depended on it
loses effective access on its very next use — without ever touching the key record itself.

### Verification is enrichment-style, not self-verifying — but does not fail open

A new `POST /verify-api-key` on tower, SPIFFE-gated exactly like `/enrich`, called by portcullis on
every API-key-authenticated request. This reuses the `Allow`/`Deny`/`Unreachable` three-way outcome
shape session enrichment already established, at the cost of coupling API-key request latency to
tower's availability — the natural evolution being a self-verifying, locally-checkable key once
real traffic data justifies the complexity (portcullis would need to consume AMQP for revocation,
which it doesn't today); explicitly deferred, not designed here.

**Portcullis's implementation deliberately does not reuse `enricher.rs`'s
`EnrichmentOutcome`/`AllowOutcome` types verbatim**, despite the structural mirroring above. A
session's identity (`sub`/`idp`/`identityHash`) comes from the *already locally-verified* session
JWT itself, established before `/enrich` is ever called — `/enrich`'s own response never carries
identity at all. An API key has no such locally-verifiable credential; `/verify-api-key`'s response
has to supply identity itself, and an org-owned key has no real account to attribute one to at all
— a case `AllowOutcome.account_id: String`'s non-optional shape can't represent without a breaking
change to every existing `/enrich` caller. A parallel type
(`api_key_verifier::ApiKeyAllowOutcome`) is more honest than forcing the reuse.

More importantly: **the API-key path does not fail open on `Unreachable`**, unlike the session
path's ADR-0015 posture. A session's identity is cryptographically verified locally before
enrichment ever runs, so failing open there means "authenticated, but with zero roles" — a safe
default. An API key's `apiKeyId`/`secret` pair is not self-verifying at all; nothing about it is
checked without tower. Failing open here would mean forwarding a request bearing an entirely
unverified, possibly fabricated credential as if it were a real (if degraded) authenticated caller
— a tower outage would otherwise let any string shaped like `authstar_x_y` through. Denying
outright (503) when tower is unreachable is the only posture that doesn't create that hole. This is
a deliberate, narrow exception to ADR 0015's fail-open policy, scoped specifically to a credential
class that has no independent local verification, not a reconsideration of that policy for the
session path.

### Baseline identity for the minted internal JWT

A personal key resolves the owning account's real email (via tower's `contactStore`, the same
source `/enrich`'s own callers already trust). An **org-owned key has no real person to attribute
`sub` to**, so it gets a synthetic, non-deliverable `sub: apikey:{apiKeyId}`. `idp` is a fixed
sentinel string (`"api-key"`) naming the credential mechanism rather than a real login provider,
and `identity_hash` reuses `apiKeyId` itself (already a unique, non-secret identifier — exactly
what `identity_hash` is for on the session path). This is a genuine, new behavior — any code
relying on `getEmail()`/`sub` for notifications or display must check `apiKeyId` first;
`authstar-core`'s `identity.ts` documents the caveat directly on `getEmail()`.

### New `InternalClaims.apiKeyId?: string`

Purely additive across all three copies of this type (portcullis's Rust `jwt/internal.rs` struct,
`@bytepunx/authstar-core`'s TS type, and tower's own decoded view) — same treatment as
`accountId?`/`isNewAccount?`. Presence discriminates "this request came from an API key" for any
downstream service that needs to gate session-only actions, or just wants it for audit.
`authstar-clients` was already at `2.0.0` with ADR 0100's `organizationMemberships`; this is a
simple additive **minor** bump, no breaking-change ceremony.

### Rate limiting: portcullis's first rate-limiting infrastructure

In-process, single-replica, fixed-window, keyed by `apiKeyId` — following `chronicle`/`lookout`'s
existing in-memory-limiter precedent (TypeScript services) and their same explicit "single-instance
pilot, needs Redis/Valkey before multi-replica" disclaimer, now implemented for the first time in
Rust. Confirmed portcullis genuinely runs `replicas: 1` today (no HPA) via its real deployment
manifest, so this is a currently-accurate basis for the limitation, not a hopeful assumption.
Config (`requestsPerMinute`, optional `burst`) arrives fresh on every `/verify-api-key` response,
applied against the existing local bucket for that key — a config refresh never resets the bucket's
current window. `burst` is folded into a single effective per-window cap
(`requestsPerMinute + burst`) rather than modeled as a true token-bucket dimension — a
simplification worth revisiting if real traffic shows the difference matters.

API keys never carry tower's own closed `PERMISSION_CATALOG` grants, only application-scope roles
— the same "deliberately narrow blast radius" framing ADR 0079 used for usage-reporting
credentials, applied here to keep this credential class contained to "access within one
application," never tower's own admin surface.

### Entitlement plumbing: `apiKeyLimit`/`apiKeyRateLimit`, with one explicit divergence from `seatLimit`'s template

`keep`'s `plan_mapping_actor` gains `apiKeyLimit: number | null` and `apiKeyRateLimit:
{requestsPerMinute, burst?} | null`, added after this actor's original ADR 0083 design the same
mechanical way `meter` was: field + default → `Create`/`UpdateCommand` → `create()`/`update()` →
`created()`/`updated()` appliers → route JSON schema. Two new `EntitlementEvent` types
(`ApiKeyLimitChangedEvent`/`ApiKeyRateLimitChangedEvent`, `entitlement-publisher.ts`) are kept
separate, not merged into one, mirroring `SeatLimitChangedEvent`'s own shape.

**The one real, explicit divergence**: `SeatLimitChangedEvent.scope` is deliberately restricted to
`{tenant}|{organization}` ("an individual account has no seats to limit"). The two new API-key
event types use the full `EntitlementScope` (`{account}|{tenant}|{organization}`) instead — an
individual account's own key allowance is meaningful in a way seats never are. Tower's
`entitlement-consumer.ts` dispatches accordingly (`organization.set-api-key-limit` or
`account.set-api-key-limit`, no `{tenant}` fallback — this feature is entirely plan-mapping-scoped,
never provisioning-time tenant-wide).

Tower's `account`/`organization` actors both gain `apiKeyLimit: number | null` (`null` = unlimited,
matching `seatLimit`'s own meaning) and `apiKeyRateLimit`. The *destination* field's default at
`created()` is **`0`, not `null`** — fails closed, mirroring ADR 0100's own `organization.seatLimit`
null-means-one-seat divergence reasoning: an owner that never received a plan grant can't create
keys anyway (it also needs `api-keys:manage`, granted separately), but this keeps the limit check
itself fail-safe on its own rather than defaulting to "unlimited" for an owner entitlements simply
haven't reached yet. `keep`'s own publish helper (`publishApiKeyLimitIfSet`) mirrors
`publishSeatLimitIfSet`'s null-is-silent convention (a mapping that never set a limit publishes
nothing on every activation) while allowing `{account}` scope through, unlike its seat-limit
counterpart.

### `authstar/web`: no application builds its own UI for this

New client methods on `web`'s tower client (`create/list/revoke{Personal,Organization}ApiKey`,
plus `getAccount` for the create-form's "which roles can I currently grant" checklist — reusing the
existing, already-self-accessible `GET .../accounts/{accountId}` route rather than adding a new
one). Two new embed route groups:

- `(embed)/applications/[applicationSlug]/api-keys` — the first **individual-account-scoped**, not
  organization-scoped, embed surface in `web`. Gated on `requireSession` alone (self-service, no
  membership check) — a new precedent alongside ADR 0100's org-scoped embed group.
- `(embed)/organizations/[organizationId]/applications/[applicationSlug]/api-keys` — nests under
  the *existing* org embed route tree via ordinary SvelteKit route nesting, reusing that group's
  own membership-gated layout rather than a parallel one.

The one-time secret reveal reads from the create action's own ephemeral SvelteKit form-result data
(`form.created`), never from `load`/`PageData` — a reload can never re-display a secret already
shown once. This is genuinely new UI; no prior one-time-secret display pattern existed in `web` to
copy.

## Consequences

- **Tower**: new `apiKey` actor (`create`/`revoke` only, no `update` — immutability is structural,
  not just a documented rule); `role_definition_actor`'s protected-role set gains its first
  application-scope member (`PROTECTED_APPLICATION_ROLE_NAMES`); `applications.ts` auto-seeds on
  create plus a one-time operator-only backfill route; new `src/routes/api-keys.ts` (personal + org
  trees) and `src/routes/verify-api-key.ts`; `account`/`organization` actors gain
  `apiKeyLimit`/`apiKeyRateLimit` fields and `set-api-key-limit`/`set-api-key-rate-limit` commands;
  `lib/permissions.ts` gains `requireAppRole` (a **live** re-fetch of the caller's current
  `grantedRoles`, not anything from the token's own `roles` claim — that claim is pre-filtered by
  portcullis to whatever application the *current inbound request* was proxied for, not the
  arbitrary `{appSlug}` route param this gate needs to check against).
- **Keep**: `plan_mapping_actor` gains the two new fields; `entitlement-publisher.ts` gains two new
  event types with the `{account}`-scope divergence noted above; `webhooks.ts` gains two new
  publish helpers, wired at the same subscription-activated/updated call sites `seatLimit`'s own
  publisher already uses.
- **Portcullis**: new `api_key.rs` (Bearer-header parsing — any `Authorization: Bearer` header at
  all is treated as an attempted API-key credential, never merely ignored, since a browser session
  travels exclusively by cookie in this system; a malformed one is always 401, never a redirect,
  regardless of `is_browser_request`'s own heuristics), new `api_key_verifier.rs` (the parallel
  outcome/claims types discussed above), new `rate_limit.rs` (the platform's first rate limiter),
  `jwt/internal.rs` gains `api_key_id` plus a dedicated `api_key_claims` builder,
  `gate.rs`'s `auth_gate` gains the new credential branch (checked only after session verification
  fails) and `handle_api_key_outcome` (structurally parallel to `handle_enrichment_outcome`, but
  denies rather than fails open on `Unreachable`). `PortcullisState`/`build_state` gain
  `api_key_verifier`/`api_key_rate_limiter` fields, threaded through every existing call site.
- **authstar-clients**: `@bytepunx/authstar-core` gains `InternalClaims.apiKeyId?` and a
  `getEmail()` doc-comment caveat; minor version bump (`2.0.0` → `2.1.0`), no code changes needed
  in `@bytepunx/authstar-fastify` (its own `InternalClaims` type is re-exported from core, not
  redefined) or in `fastify`'s own `package.json` pin (`^2.0.0` already accepts `2.1.0`).
- **web**: two new embed route groups (one a new *kind* of embed surface — individual-account,
  not org-scoped); the existing plan-mapping admin form gains the two new fields.
- The two pre-existing, unrelated bugs found while researching this (`web`'s tower client wiring
  `issueUsageCredential`/`revokeUsageCredential` to tower's base URL when that route only exists on
  keep; `web`'s `ApplicationDetail` type expecting fields tower's actual `application_actor.ts`
  response never produces) are explicitly **not** fixed here — flagged for a future, separately
  scoped session.
- Self-verifying API keys (portcullis consuming AMQP for revocation, removing the per-request tower
  round trip) remain a real, deferred future evolution, not designed here.

## Related

- [ADR 0079](0079-batched-usage-reporting-credentials.md) (superseded in spirit — the narrow
  usage-reporting credential this ADR's key-format improvements were measured against still exists
  unchanged for its own purpose)
- [ADR 0100](0100-organization-membership-and-open-role-catalog.md) (the role-catalog,
  organization-membership, and protected-baked-in-role mechanisms this decision reuses and extends
  into a new scope kind)
- [ADR 0069](0069-role-interpretation-is-application-owned.md) (the open-role-vocabulary precedent;
  `api-keys:manage`'s protected-role status is the same narrow "authstar interprets this one role
  name as its own access-control primitive" carve-out ADR 0100's four organization roles already
  established)
- [ADR 0015](0015-exempt-routes-never-blocked.md) (the session-path fail-open posture this
  decision's own API-key verification path deliberately does not extend to)
- [ADR 0089](0089-internal-jwt-carries-its-own-tenant-hint.md) (the SPIFFE-gated tower-round-trip pattern
  `/verify-api-key` reuses from `/enrich`)

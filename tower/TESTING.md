# Testing Conventions

Three tiers, run separately (`npm run test:behavior` / `test:e2e` / `test:integration`), or
together (`npm run test:all`). All three build `src/` to `dist/` first (`pretest`) — `consequent`'s
own actor loader globs for `*_actor.js` and has no awareness of `.ts` at all, even under `tsx` —
so every tier runs against the same compiled artifact the real server loads, not a test-only path.

## `spec/behavior/*.spec.ts` — API contract

- `fastify.inject()` against a real fastify instance — no real network.
- Backed by `consequent`'s own built-in in-memory default adapters (`spec/lib/in-memory-consequent.ts`)
  — real `consequent` command/event behavior, not mocked responses, just not Postgres-backed.
- One file per route group, asserting exactly what's in that Story's acceptance criteria:
  request/response shapes, status codes, and the specific rules (a restricted status transition,
  a field that's structurally never accepted).

## `spec/e2e/*.spec.ts` — full flows, still no external dependencies

- Same in-memory `consequent` instance as behavior tests, but exercises a realistic *sequence* of
  calls through the HTTP surface (create → edit → suspend → rejected re-suspend → final state),
  not one call's contract in isolation.
- Where a flow's first step has no HTTP route yet (e.g. tenant creation, still pending its own
  larger Story), call `consequent.handle()` directly for setup and say so in a comment — don't
  pretend the route exists.

## `spec/integration/*.integration.spec.ts` — real dependencies, this service only

- Real Postgres via `testcontainers` (`@testcontainers/postgresql`), real `consequent-postgres`
  adapters — proves the actual storage wiring works, not just the in-memory fake.
- Scoped to this one service and its own direct dependency. No other authstar service is ever
  called here — multi-service integration is explicitly a separate, later project.
- **Close adapters before stopping the container**, not after — `consequent-postgres`'s own
  `.close()` on whatever `initialize()` returned, called *before* `container.stop()`. Stopping
  first leaves an open client connection with nowhere to go and surfaces as a noisy uncaught
  "terminating connection due to administrator command" exception, even though the tests
  themselves already passed.
- Needs Docker running locally / in CI. `beforeAll`'s own timeout should be generous (60s+) —
  container pull + start can genuinely take a while on a cold image cache.

## Five real bugs this pilot found — worth knowing before writing more services' tests

1. **`consequent`'s loader only finds compiled `*_actor.js` files** — pointing it at `src/actors`
   (TypeScript source) silently loads zero actors (`Object.keys(actors) === []`), which then
   fails downstream with a confusing `Cannot read properties of undefined (reading 'metadata')`
   error that gives no hint the actor was never loaded at all. Always point `consequent`'s
   `actors` config at the *compiled* directory.
2. **A command handler must reject via a rejected promise, never a synchronous `throw`.**
   `consequent`'s `apply.ts` only wraps a handler's *return value* in
   `Promise.resolve(...).then(onSuccess, onError)` — a synchronous throw happens before that
   promise chain exists and hangs the actor's command queue instead of producing a clean
   `{ rejected: true }` result. Every rejecting command handler in this codebase must
   `return Promise.reject(new Error(...))`, not `throw`.
3. **Fastify's default AJV options set `removeAdditional: true`** — an `additionalProperties:
   false` schema silently *strips* an unknown field instead of rejecting the request, even
   though that's not fastify's advertised default behavior in casual reading of its docs. Every
   `buildApp()` call in this codebase overrides this (`ajv: { customOptions: { removeAdditional:
   false } }`) so a schema that says "reject unknown fields" actually does, everywhere, not just
   where someone remembers to check.
4. **A *command* handler's `then` function receives the whole `ActorInstance` wrapper as its
   first argument, not `instance.state`** — unlike an *event* handler, which correctly receives
   `instance.state` (confirmed directly against `consequent/dist/apply.js`: `processCommand`
   calls `handle(instance, command)`, `processEvent` calls `handle(instance.state, event)`).
   Every command handler in this codebase before `erasureRequest.acknowledge` (the erasure
   cascade's tracking actor, ADR 0026) happened to never read its first parameter, which is why
   this went unnoticed — naming the parameter `_tenant`/`_account`/etc. and ignoring it papered
   over the real behavior. `acknowledge` needed to read prior `acknowledgedBy` state to decide
   whether to also flip `status` to `completed`, discovered this the hard way (a test that
   silently never reached "completed"), and was restructured to make that decision inside the
   corresponding *event* handler instead, which does get real state — see
   `src/actors/erasure_request_actor.ts`'s own header comment for the full writeup. If a future
   command handler needs to read prior state, it cannot do so from its own first parameter;
   fetch the actor's current state at the route/caller level before invoking the command instead.
5. **`consequent-postgres`'s `<type>_id_map` table stores `aggregate_id` as a fixed
   `character(42)` column** (`create_id_map_table.sql`) — an actor id longer than 42 characters
   fails with a real Postgres error (`value too long for type character(42)`) the moment any
   command targets it, only surfacing once the integration tier ran against real Postgres (the
   in-memory adapter has no such limit, so behavior/e2e tests never caught it). This pilot slice
   hit it directly: `contact`'s id and the first-admin invite's `token` are both HMAC/hash-derived
   and were originally full 64-character hex SHA-256 digests — both now truncated to 40 hex
   chars (160 bits, still cryptographically ample) in `src/lib/contact-store.ts`'s
   `computeContactId` and `src/routes/provisioning.ts`'s invite-token derivation. **This is a
   platform-level constraint worth flagging beyond this pilot slice**: ADR 0027's own
   `identityHash = HMAC-SHA256(...)` is described only as a raw hash with no stated encoding —
   if portcullis ever sends a full 64-character hex digest as `identityHash`, the real `identity`
   actor (`identifiedBy: 'identityHash'`) will hit this exact ceiling against real Postgres. Not
   fixed here (portcullis's hash encoding is out of this task's scope) — flagged for whoever
   picks up the live cross-service integration work next.

## Scope covered by this pass (tower's four target cross-service flows)

Extends the pilot above with `src/server.ts` (the first real production entrypoint) and the
specific slice of Stories 002/003/005/007/008/012 needed to make four cross-service flows real:
the login/enrichment journey through portcullis, tenant creation/provisioning (triggering
herald's invite-sent), the keep→tower entitlement consumer, and tower's producer/tracking role in
the erasure cascade. Same three-tier convention as above; new suites:

- `spec/behavior/provisioning.spec.ts`, `enrich.spec.ts`, `identities.spec.ts`, `contacts.spec.ts`,
  `entitlement-consumer.spec.ts`, `erasure-ack-consumer.spec.ts`
- `spec/e2e/tenant-provisioning-and-login.e2e.spec.ts` (provision → first-admin login/invite
  redemption → enrichment → a simulated keep entitlement event → enrichment reflecting it, all
  through HTTP except the RabbitMQ publish, which is simulated via the same fake-`ChannelLike`
  the consumer's own behavior tests use), `erasure-cascade.e2e.spec.ts` (signup → erasure request
  → two simulated downstream acknowledgements → completed)
- `spec/integration/provisioning.integration.spec.ts`: the new actors (`application`, `provider`,
  `account`, `identity`, `invite`, `erasureRequest`) plus `ContactStore`'s real Postgres
  implementation against a real, disposable Postgres, following the same testcontainers template
  as `tenants.integration.spec.ts`.

**Fixed after the fact — a real cross-service shape bug, caught by herald's own build pass**:
`provisioning.ts`'s `comms.transactional.invite-sent` publish originally used a pre-ADR-0025
plaintext shape (`{to, templateData, ...}`) that predates herald's amended, encrypted-payload
contract — herald's real `IngestMessage` interface (`src/lib/ingest.ts`) requires `contactId`,
`title`, `templateVersion`, `encryptedPayload`, `payloadKeyVersion`, and has no `to` field at all
(recipient addressing goes through `contactId`; herald resolves the email itself). Fixed to match
that contract exactly, using a new `src/lib/herald-payload-crypto.ts` (RSA-OAEP-SHA256-wrapped
AES-256-GCM, byte-for-byte mirroring herald's own `payload-crypto.ts` algorithm) to build the
`encryptedPayload` envelope. Verified two ways, not just structurally: `spec/behavior/
herald-payload-crypto.spec.ts` proves a full local encrypt→decrypt round trip (plus that a
different keypair genuinely cannot decrypt it), and a one-off script importing both packages'
*real compiled output* directly (tower's `encryptForHerald` → herald's real `decryptPayload`)
confirmed genuine cross-package interop, not just two independently-correct implementations that
happen to agree on paper.

**A second, similar cross-service shape bug — caught while scaffolding the integration-test
repo's signet secrets, before it ever hit a real cluster**: `provisioning.ts`'s four per-tenant
secrets all used the same `randomSecret()` (opaque random bytes, base64url). That's correct for
`identity-hash-key`/`contact-hash-pepper` (raw HMAC-SHA256 key material, any bytes work -- see
portcullis's `identity_hash.rs`), but wrong for `session-key`/`internal-key`: portcullis's
`EcKeyPair::from_pem_bytes` (`authstar-middleware/src/keys.rs`) parses these as PEM-encoded P-256
EC private keys for `jsonwebtoken`'s ES256 signing, which random bytes are not. Confirmed against
portcullis's actual source, not assumed, before fixing. Real-world impact if unfixed: every
tenant's session/internal JWT issuance would fail the moment a real portcullis instance tried to
load the key. Fixed with a new `randomEcPrivateKeyPem()` (Node's own `generateKeyPairSync('ec',
{namedCurve: 'prime256v1', ...})`, PKCS8 PEM) used for just those two secrets. Verified by parsing
the actual generated PEM back through `node:crypto`'s `createPrivateKey` and asserting it's a real
`ec`/`prime256v1` key (`spec/behavior/provisioning.spec.ts`) -- not a separate cross-language
interop script this time, since PKCS8 is a well-defined, unambiguous standard (unlike the
bespoke encrypted-envelope format above) and portcullis's own test suite already exercises
`from_pem_bytes` against standard PKCS8 PEM fixtures.

Two gaps this fix did not originally close, flagged rather than silently assumed away -- both
now resolved, see below:
1. ~~No real signet-based public-key distribution exists yet~~ — **now wired**. `server.ts`'s
   `loadHeraldPayloadKey` reads `heraldPayloadPublicKey` (`{version, publicKeyPem}`) from
   tower's own signet bundle secrets and builds a real `HeraldPayloadKey` via
   `heraldKeyFromPem`, falling back to `createEphemeralHeraldKey` (loudly logged) only until
   herald's `POST /operator/rotate-keys` (ADR 0081, herald's own repo) has pushed that secret
   at least once for a given installation — see herald's own TESTING.md for the producer side.
2. ~~No herald template exists for `invite-sent` at the point tower publishes this event~~ —
   **now resolved on herald's side** (`seedBuiltInTemplates`, herald's own repo/TESTING.md) — a
   global-default `invite-sent` template is seeded once at herald's boot, per Story 003's own
   "seeding built-in templates is an operational/deployment concern, not an API route." Nothing
   changed in this repo for that half; see the encrypted-payload shape fix directly below,
   found while confirming the two repos actually agree end to end.

**A real, previously-shipped bug found while closing the gap above: the encrypted payload's
inner shape didn't match what herald's send-worker actually reads.** This route encrypted a flat
`{ tenantName, token, adminHost }` object — but herald's real `send-worker.ts` reads
`decrypted.to`/`decrypted.templateData` (confirmed directly against that file, not assumed), a
shape this flat object could never have satisfied. Every real first-admin invite would have
failed at send time even after the missing-template gap above was closed. Fixed to `{ to:
body.adminEmail, templateData: { tenant: { name: body.name }, token, adminHost } }` — nesting
`tenant.name` to match ADR 0078's own `templateData` convention. `spec/behavior/
provisioning.spec.ts` now injects a real (non-ephemeral) keypair via `buildApp`'s
`heraldPayloadKey` option specifically so the test can decrypt the published envelope and assert
its actual contents, not just its structural shape — the same class of proof
`herald-payload-crypto.spec.ts` already established for the envelope format itself, extended
here to the payload it actually carries.

**Permission enforcement middleware (Story 014) is now implemented** — `src/lib/permissions.ts`'s
`requirePermission(grant)` is a route `preHandler`, applied to every write/sensitive-read route
this codebase currently has: `PATCH /tenants/:tenantSlug` (`tenant:manage`), `GET`/`PATCH
/tenants/:tenantSlug/contacts...` (`contacts:read`), `DELETE .../contacts/:contactId`
(`contacts:erase`), `GET .../erasure-requests/:contactId` (`erasure-requests:read`). Verification
runs through `@bytepunx/authstar-fastify` (now published, unblocking this — see below), registered
globally in `build-app.ts` with `required: false` so `requirePermission` — not the plugin's own
default 401 — decides every failure mode as one generic 403 (Story 014's stated posture: no
distinction between missing/invalid/degraded token and wrong grant). Tenant-JWKS resolution is ADR
0089's `perTenantJwksKeyProvider`, reading the tenant hint off the internal JWT's own protected
header (portcullis sets it at mint time) rather than any forwarded signal — the default
`authstarGetKey` in `build-app.ts`; tests override it with a `staticKeyProvider` fixture
(`spec/lib/internal-jwt.ts`) pinned to a locally-generated keypair, so no test makes a real JWKS
fetch. Providers/roles/invites/activity-feed routes from the story's own route table don't exist as
code in this repo yet (see "Deliberately deferred" below) — nothing to gate there until those
routes are built. Applications routes (below) are now real and gated the same way.

**`POST /tenants/:tenantSlug/accounts/:accountId/change-email` (ADR 0076) is now implemented** —
`src/routes/accounts.ts`, the first route in this repo's own `accounts` family. Deliberately a
`POST`, not a `PATCH` (ADR 0076: this repoints `account.contactId` to a different `contact`
resource, it isn't a field-level edit of the old one). Gated by `accounts:manage`. Resolves the
new email's `contactId` hash via the existing `contactStore.upsert` (find-or-create, the same
deterministic lookup invite acceptance already relies on), repoints `account.contactId` via a
new `account.change-email` command/`contact-changed` event, then publishes
`herald.contact.migrated` (`{tenant, oldContactId, newContactId}`) — **the first real producer**
for ADR 0024's carry-forward message; it existed on paper with no caller until now. A no-op
(no repoint, no publish) when the new email resolves to the account's current contact already,
rather than publishing a confusing same-id migration event. Tested in
`spec/behavior/accounts.spec.ts` — 404/cross-tenant, the happy path (repoint + exact publish
payload), contact reuse (no duplicate `contact` created for an already-known email), the no-op
case, and the same 403/400 coverage every other gated route gets. Herald's own consumer side
(`contact-lifecycle-consumer.ts`) was already built against this exact contract in an earlier
pass, including the ADR 0076 `suppression` carry-forward extension — see herald's own
TESTING.md; no changes needed there.

**Applications CRUD (Story 004, Applications half only) is now implemented** —
`src/routes/applications.ts`: `POST`/`GET` (list+detail)/`PATCH`/`DELETE
/tenants/:tenantSlug/applications[...]`, gated by `applications:manage` on every write. Built as
a prerequisite for ADR 0047's keep-side reference cache (task tracker's decomposition of "keep:
grantedRoles reference cache poller") — keep needs a real way to know whether an application
slug exists and is active before its own consumer/backfill work (next in the chain) has anything
real to consume. Two deliberate scope boundaries, both explained in the route file's own header
comment:

- **Providers CRUD (the other half of Story 004) is not built.** Not needed by ADR 0047 (keep's
  reference cache never tracks providers, only applications/role definitions, per the story's own
  text) and orthogonal to it — OIDC provider management for portcullis's own routing. `exposedProviders`
  validation on the applications routes still works for real, though: each entry is checked
  against a real, existing, active `provider` actor (`consequent.fetch('provider', '{tenant}:{name}')`),
  it just doesn't get its own CRUD surface here.
- **`upstream`/`cors`/`exempt`/`auth` (ADR 0020's full `application` shape) are not added to the
  actor.** Portcullis-routing-config concerns with no bearing on ADR 0047's actual driver. `publicUrl`
  *is* added, though — Story 004/ADR 0051's `publicUrl`-host-must-be-in-`hosts` validation is cheap
  and real, implemented and tested on both create and update.

Two further deviations from the story's literal route description, both driven by checking this
codebase's actual actor shapes directly rather than the story's originally-envisioned
`aggregateFrom`-synced embedded array (see `tenant_actor.ts`'s header comment on why
`aggregateFrom` isn't actually used):

- List/detail/patch/delete resolve directly against the `application` actor
  (`consequent.find('application', {tenant})` for list, direct `consequent.fetch('application',
  '{tenant}:{slug}')` for detail/patch/delete — the actor's own `identifiedBy: 'key'` makes this
  an O(1) computation, no search needed) rather than via `tenant.applications`. That embedded
  array only ever carries `{slug, name}` (`TenantApplicationRef`) — no `status` — so it structurally
  cannot answer "list active applications" on its own; a direct actor read is strictly more
  correct, not just simpler.
- Creation's race-free duplicate-slug rejection (the story's own requirement: "checked against
  `tenant.applications` at command-handling time... `consequent`'s single-writer-per-actor queue
  on `tenant` is what makes this race-free") is now real, not just described — `tenant_actor.ts`'s
  `add-application` command gained a `slugNotTaken` guard (same `{when, then}` + reject-fallback
  pattern already used by `suspend`), rejecting with 409 rather than the silent no-op it used to
  be. Verified directly: `applications.spec.ts` proves a duplicate slug under the same tenant
  409s while the identical slug succeeds under a *different* tenant.

`application` also gained its own soft-delete: a `delete` command/`application.deleted` event
(guarded `isNotDeleted`, same pattern as `suspend`'s `isActive` guard), with the DELETE route
itself treating an already-deleted application as a no-op 200 rather than a 409 — matching
`accounts.ts`'s change-email no-op convention for "retry converges" (ADR 0067).

Every write that creates an application or changes its `status`/`hosts` publishes the matching
`application.<created|hosts-changed|suspended|deleted>` event (ADR 0047's own outbound-event
requirement for keep's future consumer) — `{tenant, application, name, status}`, the same shape
`herald.contact.migrated`/`contact.purged` already established as this codebase's outbound-event
convention. Verified in `applications.spec.ts` by asserting the spy publisher's exact calls, not
just that *something* got published.

A real, pre-existing bug found and fixed while building this: `tenant_actor.ts`'s in-memory
default in-memory search adapter — used only by tests, `consequent-postgres`'s real one does a
correct upsert-by-id (confirmed against its `set_<type>_search_fields` SQL) — is a module-level
singleton (`consequent/dist/index.js` constructs its `defaults.searchAdapter` once, at module
import time, not per `initialize()` call) whose field index never deduplicates repeated writes of
the same id. Reusing a tenant slug/application slug already exercised by an earlier
`buildInMemoryConsequent()`-backed test in the same file makes `find()` return accumulated
duplicate ids — not a bug in `applications.ts`'s route logic, purely a test-isolation artifact of
that in-memory adapter. `applications.spec.ts`'s list tests use dedicated, not-reused-elsewhere
tenant slugs to avoid it; worth remembering for any future spec file that calls `consequent.find()`
with criteria values also used by other tests in the same file.

**`roleDefinition` (ADR 0047, tower Story 001) is now implemented** — `src/actors/
role_definition_actor.ts` plus `src/routes/role-definitions.ts`: `POST`/`GET`
(list+detail)/`PATCH`/`DELETE /tenants/:tenantSlug/role-definitions[...]`, gated by
`roles:manage` on every write. Built as the next link in ADR 0047's dependency chain after
applications (above) — keep's future reference cache needs a real role catalog to consume/backfill
from, same reasoning. Key points:

- **Composite key is purely positional, no static tags** (`{tenant}:{name}` tenant-wide,
  `{tenant}:{appSlug}:{name}` application-scoped) — ADR 0047's own 2026-08-05 correction, applied
  directly rather than the ADR's original (superseded) `{tenant}:{scope}:{name}` shape. `GET`/
  `PATCH`/`DELETE`'s `{id}` route param **is** this key, URL-encoded (ADR 0051's clarification) —
  fastify's router decodes path segments automatically, so `request.params.id` is already the
  plain key string, no extra decoding needed. Tested directly:
  `role-definitions.spec.ts`'s detail/patch/delete tests all pass `encodeURIComponent('acme:admin')`
  in the URL and assert the round trip resolves correctly.
- **The composite key is itself the uniqueness constraint, checked race-free with no parent-actor
  coordination** — unlike `application` (needs a sibling-slug check against every *other*
  application under the same tenant, requiring `tenant`'s own single-writer queue),
  `roleDefinition`'s own single-writer-per-actor queue on this exact key already serializes
  concurrent creates of the *same* key. `create`'s `doesNotExist` guard (same `{when, then}` +
  reject-fallback pattern as `application`'s `suspend`/`delete`) rejects a duplicate name+scope
  with 409, whether the existing definition is active or retired — a retired name isn't reusable,
  same "stable historical reference" reasoning ADR 0082 already applied to `inviteCode`.
- **Creating an application-scoped role definition (`scope: {application}`) validates the
  referenced application exists and is active** (ADR 0047: "tower validates the referenced
  application exists at that moment") — a direct `consequent.fetch('application',
  '{tenant}:{appSlug}')` check, same bar `applications.ts`'s own `exposedProviders` validation
  already applies to provider references. Application validity is checked only at definition
  time, never re-checked downstream, per the ADR's own stated reasoning (granting a role
  transitively implies its definition was already valid).
- **`scope` is deliberately not in the actor's `searchableBy`** — it's `'tenant' | {application}`,
  not a flat scalar the default in-memory/Postgres search adapters can compare directly. The list
  route fetches by `tenant` alone (`consequent.find('roleDefinition', {tenant})`) and filters by
  `scope`/`status` in application code, the same approach `applications.ts`'s list route already
  takes for its own `status`/`_admin` filtering.
- Every write that creates or retires a role definition publishes the matching
  `roleDefinition.<created|retired>` event (ADR 0047's own outbound-event requirement) —
  `{tenant, name, scope, status}`. `PATCH`'s `description`-only edits publish nothing — not a
  lifecycle transition, no consumer needs to know about it.
- **Deliberately not wired into any role-*granting* write path** — `POST
  /accounts/{accountId}/roles`, and role lists on invite/inviteCode creation, are the write paths
  ADR 0047 says should validate against this catalog, but none of them exist as routes in this
  repo yet (`POST /accounts/{accountId}/roles` was never built by any prior task; invite/inviteCode
  creation is Story 007's own still-pending scope — see "Code-based invites" below). This task's
  actual driver is keep's reference cache needing a real source of truth, not a retrofit of
  call sites that don't exist yet — see `role-definitions.ts`'s own header comment.

**Deliberately deferred** (documented here, matching every other authstar service's own scope
notes, rather than left unstated):

- **Code-based invites** (Story 007's `inviteCode`, multi-redemption trial codes with
  `maxRedemptions`/`trialDurationDays`) — only token-based invite redemption is implemented.
  `POST /identities/resolve`'s `redeem.type` schema only accepts `"invite"`.
- **The operator route-tree reuse pattern (Story 013 / ADR 0030)** — `POST /tenants`'s operator
  check is a single shared bearer-token header comparison, not the full `/operator/...` route
  tree, `X-Operator-Actor` threading, or cross-tenant search/activity/stuck-erasure views (ADR
  0075's `GET /operator/erasure-requests/stuck` is not implemented; `GET
  /tenants/:tenantSlug/erasure-requests/:contactId` covers the single-request read path only).
- **mTLS/SPIFFE verification at the fastify layer** for `/enrich` and `/identities/resolve` — both
  routes trust their caller's `tenant` field as-is, matching ADR 0001/0003's stated posture, but
  this pilot slice doesn't add fastify-level SPIFFE peer-certificate verification (portcullis's
  real client is real; tower's own server-side check of *who's calling* is not).
- **`aggregateFrom`'s built-in cross-actor event routing** — `tenant`'s `add-application`/
  `add-provider` commands are hand-rolled (a direct route-level `consequent.handle()` against the
  new child actor, plus `tenant.add-application`/`tenant.add-provider` to append a lightweight
  reference into `tenant`'s own embedded array) rather than using `consequent`'s own
  `aggregateFrom` mechanism (`manager.js`'s `getSourceIds`/`onActor`), which infers source actor
  ids from state shapes it never gets a chance to see for a same-request child creation. See
  `tenant_actor.ts`'s header comment for the full rationale. `add-application` now has a real,
  race-free duplicate-slug rejection guard (`slugNotTaken`, added alongside `applications.ts` —
  see below) — `add-provider` does not yet, since no route calls it outside `provisioning.ts`'s
  own already-guarded default-provider seeding.
- **Identity-alias garbage collection** (ADR 0028) — an aliased older-generation `identity`
  record is created but nothing ever prunes it after its retention window closes; no such sweep
  is designed anywhere in the source docs either.
- **Real signet secret encryption** — `src/lib/signet-admin.ts`'s `createSignetAdmin` wires the
  actual `GitOpsService.syncBundle` RPC (real tar.gz streaming, real auth) but pushes secret
  values as plaintext YAML, not SOPS-encrypted — see that file's own header comment for why (the
  exact repo layout and SOPS-encryption step weren't confirmable without deeper access to
  signet's own server source within this pass's scope).
- **Live signet/RabbitMQ/SPIFFE validation** — `src/server.ts` was not run against a real
  `kluster up --profile signet` cluster in this pass (time budget went to the tested, injectable-
  interface vertical slice instead, which this task's own instructions explicitly allow: "You do
  NOT need a live cluster to build/test most of this"). Every I/O boundary it wires is exercised
  for real only through its own injected interface's test double (`ContactStore`, `SignetAdmin`,
  `Publisher`, the RabbitMQ `ChannelLike` consumers) — `server.ts` itself has no test coverage of
  its own, consistent with how every other authstar service scopes its entrypoint.
- **Usage-record writes** (`account.update-usage`) — the command/event exist (symmetry with the
  `usage` field `/enrich` reports) but nothing calls it yet; no service publishes usage events to
  tower in this pass.

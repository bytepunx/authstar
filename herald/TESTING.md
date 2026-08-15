# Testing Conventions

Three tiers, run separately (`npm run test:behavior` / `test:e2e` / `test:integration`), or
together (`npm run test:all`). All three build `src/` to `dist/` first (`pretest`) —
`consequent`'s own actor loader globs for `*_actor.js` and has no awareness of `.ts` at all,
even under `tsx` — so every tier runs against the same compiled artifact the real server would
load, not a test-only path. Same convention tower's own pilot established; nothing new here.

Current status: **102 tests passing** across 14 files — 76 behavior, 16 e2e, 10 integration. (An
earlier pass of this suite carried 3 `it.fails` tests in the Postgres integration file, documenting
a then-confirmed upstream `consequent.find()` bug — that bug is now fixed upstream, see "Bugs found
in previous passes, now fixed upstream" below; all tests in this suite are plain `it` again.)

**This pass** (real RabbitMQ wiring, `src/server.ts`, and the contact-lifecycle consumer) added:
`src/lib/contact-lifecycle-consumer.ts` + its e2e coverage (9 tests,
`spec/e2e/contact-lifecycle-consumer.spec.ts`), and `spec/integration/rabbitmq.integration.spec.ts`
(4 tests) proving `src/lib/build-comms-consumer.ts`/`src/lib/build-contact-lifecycle-consumer.ts`'s
real `amqplib` exchange/queue/binding wiring against a disposable RabbitMQ broker
(`@testcontainers/rabbitmq`). See "What's covered" and "What's deliberately left uncovered" below
for the detail, and "New findings this pass" for two real bugs/gaps this work surfaced.

## What's covered

**All six actors from Story 001**: `communicationType`, `template`, `communication`, `optOut`,
`suppression`, `sendingConfig` — full command/event coverage, not just the happy path.

**Routes**: communication-types (create/list/get/patch/delete-as-deprecate, Story 003), templates
(create-new-version/list/get-by-version, Story 003), communications (list with
filter+cursor-pagination/detail/on-demand-decrypt-render/manual-retry, Story 004 + 002),
opt-outs (get/add-category/remove-category, Story 004), suppressions (list/create/delete, Story
004), sending-config (get/patch, Story 005 minus the webhook/rotation/activity parts — see "Not
covered" below), unsubscribe (get-confirm/post-act, Story 001).

**Send worker core logic** (Story 002), tested directly against the module (no HTTP route exists
for ingestion — it's RabbitMQ-driven): suppression + opt-out checks (run fresh on every attempt,
including retries), template rendering with the CAN-SPAM footer/`List-Unsubscribe` headers gated
correctly on `category`, dispatch success/failure classification (transient → retry scheduled,
permanent → failed, exhausted retries → failed), the retry sweep, and manual retry's identical
suppression→render→dispatch sequence.

**Ingestion**, behind a fake `ChannelLike` (channel-agnostic logic; the real broker wiring is
covered separately, see below): durable creation on receipt, ack/nack sequencing, idempotent
redelivery (same `idempotencyKey` twice is a safe no-op, not a duplicate send), malformed-message
dead-lettering.

**Contact lifecycle** (`src/lib/contact-lifecycle-consumer.ts`, new this pass) — herald's subscriber
side of the erasure/lifecycle cascade, behind the same fake-`ChannelLike` convention
(`spec/e2e/contact-lifecycle-consumer.spec.ts`, 9 tests):
`contact.purged` (ADR 0026, tower's exact `{ tenant, contactId, accountId }` shape and
`'contact.purged'` routing key, confirmed against tower's own source) strips `encryptedPayload`
from every matching `communication` record via the existing `communication.purgePayload` command
and deletes the `optOut` record; `herald.contact.migrated` (ADR 0024/0076) carries forward `optOut`
categories and `suppression` from the old `contactId` to the new one. Both idempotent under
redelivery, both dead-letter malformed/missing-required-field messages rather than requeuing
forever, matching `comms-consumer.ts`'s own conventions.

**Real RabbitMQ wiring** (new this pass, `spec/integration/rabbitmq.integration.spec.ts`, 4 tests,
`@testcontainers/rabbitmq`): `src/lib/build-comms-consumer.ts` and
`src/lib/build-contact-lifecycle-consumer.ts` — real `amqplib` connect, durable topic exchange
(`authstar`)/durable queue assert, binding (`comms.#` for the former; `contact.purged` +
`herald.contact.migrated` for the latter, per ADR 0006's durable-quorum-queue posture for business
events) — against a real, disposable broker, not just the fake-channel tier above. Proves the
actual topology works, not just the channel-agnostic handler logic.

**Real crypto**, not stubbed: `src/lib/payload-crypto.ts` is a genuine hybrid RSA-OAEP + AES-256-GCM
envelope scheme (versioned keyring), `src/lib/unsubscribe-token.ts` is a genuine HMAC-signed,
versioned token scheme. Both gain an additive constructor path this pass (`PayloadKeyring`/
`UnsubscribeKeyring` now optionally accept persisted key material) so `src/server.ts` can seed them
from a signet bundle instead of always generating ephemeral keys at boot — see "What's deliberately
left uncovered" for why that path itself has no test coverage.

## `spec/behavior/*.spec.ts` — API contract

- `fastify.inject()` against a real fastify instance — no real network.
- Backed by real `consequent` command/event behavior, in-memory adapters — see "New gotchas"
  below for why this isn't simply consequent's own defaults.
- One file per route group (or, for the send worker, per module) asserting exactly what's in
  that Story's acceptance criteria.

## `spec/e2e/*.spec.ts` — full flows, still no external dependencies

- Realistic sequences: publish → ingest → dispatch → read back over HTTP
  (`comms-ingestion-and-delivery.spec.ts`); marketing send → click unsubscribe → next send in
  that category suppressed (`unsubscribe-and-suppression-flow.spec.ts`); template v1 published,
  pinned, v2 published, v1 still renders for the already-queued send
  (`template-versioning-flow.spec.ts`).
- Where a flow's first step has no HTTP route yet (communication creation is RabbitMQ-only, Story
  002), call `consequent.handle()` directly and say so in a comment — same convention tower's
  pilot used for tenant creation.

## `spec/integration/*.integration.spec.ts` — real dependencies, this service only

- Real Postgres via `testcontainers`, real `consequent-postgres` adapters.
- Scoped to the central slice (communication types, templates, communication history/send) — not
  exhaustive re-coverage of every behavior-tier test against Postgres, matching tower's own scope
  decision.
- All six tests are plain `it` as of this pass — see "Bugs found in previous passes, now fixed
  upstream" below. (This paragraph itself was stale relative to the actual spec file even before
  this pass's work started: the file's own header comment already said "FIXED upstream" and all
  six tests were already plain `it`, pinned at `consequent@2.0.1`/`consequent-postgres@2.0.4` in
  `package.json` — this section of TESTING.md just hadn't been updated to match. Corrected here
  because this pass's own `contact-lifecycle-consumer.ts` depends on `find()` working correctly
  against real Postgres for its payload-purge sweep, so getting this documented status right
  matters beyond just tidiness.)
- Needs Docker running locally / in CI. `beforeAll`'s own timeout is generous (60s+).
- **New this pass**: `spec/integration/rabbitmq.integration.spec.ts` — real RabbitMQ via
  `@testcontainers/rabbitmq`, proving `build-comms-consumer.ts`/
  `build-contact-lifecycle-consumer.ts`'s actual exchange/queue/binding wiring, using an in-memory
  `consequent` deliberately (isolates broker-wiring correctness from Postgres correctness, already
  covered by `herald.integration.spec.ts` — same reasoning chronicle's own RabbitMQ integration
  spec gives for using a fake ClickHouse client).

## What's deliberately left uncovered

- **SES/SNS bounce/complaint webhook** (`POST /_authstar/webhooks/ses`, Story 005) — needs a real
  `sendingConfig.webhookSecret` signature-verification story and SNS's notification format; the
  `communication.markBounced`/`recordComplaint` actor commands it would call *are* implemented and
  unit-testable, but the route itself isn't built.
- ~~Operator key rotation~~ (`POST /operator/rotate-keys`) — **now implemented**, see its own
  section below (ADR 0081).
- **Activity feed** (`GET /tenants/{tenantSlug}/activity`, Story 005) — mirrors tower Story 010's
  event-stream construction; not implemented.
- **Real signet integration, now closes the loop for the two key secrets.** `src/server.ts`
  fetches `dbConnectionString`/`rabbitmqUrl` from a real signet bundle (`dialWorkload` +
  `GetServiceBundle`, identical pattern to tower's own `server.ts`), and seeds
  `PayloadKeyring`/`UnsubscribeKeyring` from bundle secrets (`payloadKeyGenerations`/
  `unsubscribeKeyGenerations`) when present. Those two secrets now have a real producer —
  `POST /operator/rotate-keys` (below) pushes them on every rotation, including the first-ever
  call for a fresh installation — closing the "nothing populates them" gap this note used to
  describe. `src/lib/credential-store.ts` (tenant `credential`/`webhookSecret`) is unchanged,
  still an in-process stand-in — out of scope for this pass (not part of the signet material
  `server.ts` was asked to source; see ADR 0032's own "signet secret, never persisted in
  herald's own event log" for what its real story would need). None of `server.ts`'s own
  signet/Postgres/RabbitMQ wiring has test coverage (no live `kluster`-provisioned cluster was
  exercised against it) — same scope note tower's own `server.ts` carries, for the same reason
  (see that file's header comment).

## Operator key rotation (ADR 0081) is now implemented, closing ADR 0025's key-distribution gap

`POST /operator/rotate-keys` (`src/routes/operator-rotate-keys.ts`), gated by the same shared
operator bearer token every other operator route in this system uses (`isOperatorRequest`, ADR
0021/0045, extended to herald for the first time by ADR 0081). `{ keys:
('payload-encryption' | 'unsubscribe-signing')[] }`, each rotated and pushed independently (a
per-key failure is reported, not rolled back — `207` if some succeeded, `502` if none did, `200`
otherwise, same posture as tower's own `rotate-keys.ts`).

- **`payload-encryption`**: `payloadKeyring.rotate()`, then the *full* generation set (every
  version still held, not just the new one) is persisted back to herald's own bundle as
  `payloadKeyGenerations` — so a restart never strands an already-encrypted `communication`.
  Separately, only the *current* public key + version is pushed to `tower`'s bundle as
  `heraldPayloadPublicKey` (ADR 0025's actual distribution mechanism, wired for the first time).
  `keep`/`portcullis` are named as future publishers by ADR 0025 but don't publish anything
  through this path yet (confirmed directly against their own `src/`), so nothing is pushed to
  them until one does.
- **`unsubscribe-signing`**: `unsubscribeKeyring.rotate()`, full generation set persisted to
  herald's own bundle as `unsubscribeKeyGenerations` — no cross-service distribution, only
  herald itself ever signs or verifies these tokens.
- The first-ever call for a fresh installation *is* the initial distribution — ADR 0081 doesn't
  describe a separate bootstrap mechanism, just "triggered again rather than only at herald's
  own initial deploy," so this route is both.

Tested in `spec/behavior/operator-rotate-keys.spec.ts` against a `SpySignetAdmin` fixture
(`spec/lib/fakes.ts`, same "fake the interface, not the transport" convention as
tower's/keep's own): operator-token enforcement, correct per-target-service routing, PEM/
base64 round-tripping (a key pushed here can actually seed a working `PayloadKeyring`/
`UnsubscribeKeyring`), partial-failure reporting, and schema validation. Tower's own
consumption side (`loadHeraldPayloadKey` in its `server.ts`) is covered by that repo's own
`herald-payload-crypto.spec.ts` plus this repo's proof that what gets pushed is genuinely
loadable — not a live cross-repo integration test, same tier boundary this project draws
everywhere else (each service's own signet-bundle wiring has no test coverage, only the
library code it depends on does). 8 new tests (`operator-rotate-keys.spec.ts`) -- 115 tests
total, up from 107.
- **Real RabbitMQ/amqplib wiring — now built.** `src/lib/build-comms-consumer.ts` and
  `src/lib/build-contact-lifecycle-consumer.ts` connect via real `amqplib`, assert a durable topic
  exchange (`authstar`) and durable queues, and bind the routing keys each consumer cares about
  (ADR 0006's durable-quorum-queue posture for business events — real quorum-queue topology itself
  is expected to be declared via the Messaging Topology Operator's CRDs in git, not hardcoded from
  application code, matching tower's own convention). `src/server.ts` wires both for real.
  Genuinely proven against a real, disposable broker by
  `spec/integration/rabbitmq.integration.spec.ts` (`@testcontainers/rabbitmq`) — see "What's
  covered" above.
- ~~Retention purge scheduled sweep~~ — **now implemented**, see its own section below.
- ~~Auth/permission gating~~ — **now implemented**, see its own section below.
- **Contact lifecycle sync — now built**, with one real limitation. `src/lib/
  contact-lifecycle-consumer.ts` consumes both `contact.purged` and `herald.contact.migrated`,
  behind the same fake-`ChannelLike`-then-real-broker two-tier coverage as `comms-consumer.ts`.
  `contact.purged`: fully round-trip-tested against tower's real, confirmed producer shape (tower's
  actual `DELETE /tenants/{tenantSlug}/contacts/{contactId}` route, read directly from
  `tower/src/routes/contacts.ts`) — routing key `'contact.purged'`, payload
  `{ tenant, contactId, accountId }`, exactly what this consumer expects.
  `herald.contact.migrated`: **now has a real producer** — tower's `POST
  /tenants/{tenantSlug}/accounts/{accountId}/change-email` (ADR 0076, `tower/src/routes/
  accounts.ts`) publishes exactly the contract this consumer already expected (`{ tenant,
  oldContactId, newContactId }`, `herald.contact.migrated` routing key, *not* generalized to a
  bare `contact.migrated` the way ADR 0026 generalized the purge message) — confirmed directly
  against tower's own route, not assumed. Still no live cross-repo integration test (each
  service's own test tier stays scoped to itself, per this platform's own convention) — tower's
  `spec/behavior/accounts.spec.ts` proves the publish shape on its side, this repo's own
  `handleContactMigrated` tests prove the consume side, and the two are now confirmed to agree
  by direct comparison rather than by ADR prose alone.

## Permission enforcement middleware (Story 006) is now implemented

`src/lib/permissions.ts`'s `requirePermission(grant)` is a route `preHandler`, identical
mechanism to tower's own Story 014 (no herald-specific exemption — ADR 0070 is a tower-only
concept, herald has no account/identity model of its own). Verification runs through
`@bytepunx/authstar-fastify` (published to npm, unblocking this), registered globally in
`build-app.ts` with `required: false` so `requirePermission` decides every failure mode as one
generic 403. Tenant resolution for JWKS is ADR 0089's `perTenantJwksKeyProvider`, reading the
tenant hint off the internal JWT's own protected header; the default `authstarGetKey` in
`build-app.ts` uses a new `baseDomain` field on `BuildAppOptions` (`src/server.ts` sources it
from the signet bundle, same field name/fallback as tower's `ProvisioningConfig.baseDomain`).

Applied per this repo's own Story 006 route table, with one correction found implementing it
against the real routes (not a silent guess — see `src/routes/suppressions.ts`'s own header
comment, and the matching design-repo fix): `POST /tenants/{tenantSlug}/suppressions` is gated
by `suppressions:manage` like the rest of that route family, despite Story 006's table
originally excluding it as "the public suppression-create endpoint" — there was never a separate
public route; this file's own pre-existing comment and Story 004's own framing both already
described it as the admin/support-initiated action it actually is. `communications.ts`'s manual-
retry `PATCH` route is gated by `communications:read` — the only grant ADR 0051's closed
vocabulary defines for this resource family, since no separate `communications:manage` exists.
`/unsubscribe` (routes/unsubscribe.ts) is deliberately **not** gated at all — a public,
token-authenticated self-service flow, never a tenant-admin's internal JWT.

Test coverage: `spec/lib/internal-jwt.ts` mints locally-signed tokens against a throwaway
keypair (no real JWKS fetch in tests); every behavior/e2e/integration spec that touches a
now-gated route builds its own `createInternalJwtFixture()` and passes `authstarGetKey` to
`buildApp()`, following this repo's existing per-file (not shared-helper) app-building
convention. 107 tests total across all three tiers, up from 102 before this pass (five new
403-coverage tests, no existing test count changed). Representative
403 coverage (missing token, wrong grant, degraded token) in `sending-config.spec.ts` and
`suppressions.spec.ts` (the latter specifically covering the corrected POST route), rather than
duplicating the same assertion on every route.

## Built-in global-default templates are now seeded, closing the "invite-sent has no template" gap

Story 003's own "Not Covered Here" note names this precisely: "Seeding the built-in
global-default templates herald ships with — an operational/deployment concern, not an API
route." `src/lib/seed-templates.ts`'s `seedBuiltInTemplates`, called once from `server.ts` at
boot (not through any HTTP route — Story 003 explicitly forbids a tenant-scoped `POST
.../templates` call from ever creating a `tenant: null` template), creates the `invite-sent`
global-default template at a fixed, deterministic `templateId` (not `nextId()`'s random flake)
so repeated boots/restarts never create a duplicate or bump its version. This closes the
concrete failure mode both tower's and this repo's own comments used to name: tower's `POST
/tenants` provisioning flow publishes a `comms.transactional.invite-sent` message pinned to
`templateVersion: 1`, and until now nothing had ever created that template, so herald's
`send-worker.ts` would fail every real first-admin invite with "no template found."

Also fixed alongside this (found by direct comparison, not assumed): tower's provisioning flow
was encrypting a flat `{ tenantName, token, adminHost }` payload, but herald's real
`send-worker.ts` reads `decrypted.to`/`decrypted.templateData` — a shape send-worker could never
have actually rendered from. Tower's own fix nests the fields correctly (`{ to, templateData:
{ tenant: { name }, token, adminHost } }`, matching ADR 0078's `templateData` convention); this
repo's own built-in template is written against that corrected shape, and
`spec/behavior/seed-templates.spec.ts`'s last test proves the two actually agree end to end —
rendering the seeded template against the *exact* `templateData` tower's real route sends,
byte for byte, not a hand-picked example that happens to work.

Tested in `spec/behavior/seed-templates.spec.ts`: creation, idempotency across repeated calls,
resolution as the global-default fallback (Story 003's own two-tier lookup, already built and
tested independently of this seed), mustache syntax validity, and the cross-repo-shape render
proof above. 5 new tests — 120 total, up from 115.

## Retention purge scheduled sweep (ADR 0029) is now implemented

Two pieces, matching keep's own identically-shaped pricing-sync job (built the same pass, see
that repo's own TESTING.md):

- **`src/lib/retention-purge.ts`**'s `purgeExpiredPayloads(consequent, log?, now?)` — the real,
  tested sweep. Finds every `active` `communicationType`, and for each one finds every
  `communication` under that type's own `(tenant, type)` pair, then purges any whose payload
  isn't already cleared and whose `createdAt + retentionDays` deadline has passed. Deliberately
  does NOT add `createdAt`/`payloadPurgedAt` to `communication`'s `searchableBy` to query "past
  deadline, not yet purged" directly at the database layer — `consequent`'s default in-memory
  search adapter never indexes a falsy value at all (confirmed directly against
  `searchAdapter.js`'s own `addToFieldIndex`: `if (value) {...}`), so a `payloadPurgedAt: null`
  predicate wouldn't behave consistently across adapters. Filters in plain application code
  instead, against `{tenant, type}` (both already searchable, both always truthy) — same "derive
  the scope from what's already there, no new query capability needed" approach keep's own
  pricing-sync sweep takes. A per-communication failure is collected, not thrown, so one bad
  record never blocks the rest of the sweep.
- **`src/purge-retention.ts`** — the standalone CronJob entrypoint, mirroring `src/server.ts`'s
  signet/Postgres startup sequence minus the fastify/RabbitMQ machinery, running the sweep once
  and exiting (0 on no errors, 1 otherwise). No test coverage of its own, same scope note every
  other authstar service's real entrypoint carries.
- **Kubernetes wiring**: `~/git/authstar/integration/manifests/12-herald-retention-purge-
  cronjob.yaml` — same shape as keep's own `11-keep-pricing-sync-cronjob.yaml` (confirmed against
  kluster's `rabbitmqProvisionerCronJobManifest`, not re-derived), reuses herald's own image/
  ServiceAccount, `command` override to `dist/purge-retention.js`, `restartPolicy: OnFailure` for
  the same SPIRE per-Pod identity registration reasoning. Picked up automatically by
  `integration/scripts/deploy.sh`'s existing glob.

**A real, significant, pre-existing bug found and fixed while building this — worth knowing well
beyond this one feature.** `communication_actor.ts`'s `created` handler (and five other fields on
the same actor, and this exact pattern across many other actors in tower/keep/herald alike) set a
timestamp field via `new Date(0).toISOString()` with a comment claiming it's "replaced by
consequent's own event timestamp on read." **That mechanism does not exist.** Checked directly
against `consequent`'s own compiled source (`dispatch.js`/`apply.js`/`actors.js`) — grepped for
any handling of a field named `createdAt` and found none. `state.createdAt` is a plain domain
field like any other; `consequent` never touches it. A `new Date(0)` placeholder therefore stays
`1970-01-01T00:00:00.000Z` **forever** — harmless everywhere the field is only ever checked for
truthiness ("does this actor exist," true throughout this codebase before this pass), but fatal
for this sweep specifically, the first caller anywhere in this codebase that needs the *actual
value* for real date math (`createdAt + retentionDays`): every communication looked permanently,
trivially expired. Found by writing a debug reproduction against the in-memory `consequent`
directly (not guessed) — see the fix's own comment in `communication_actor.ts` for the full
reasoning. **Fixed only where it broke**: `communication.createdAt` now gets a real
`new Date().toISOString()`. The identical placeholder pattern on `communication`'s other five
timestamp fields (`payloadPurgedAt`, `sentAt`, `lastAttemptAt`, `nextRetryAt`, `complainedAt`),
and on every other actor's own `createdAt` across tower/keep/herald, is **not** touched — none of
them currently has any logic depending on the real value, fixing them would be scope far beyond
this task, and the existing "just needs to be truthy" callers are unaffected either way. Worth
remembering before any future feature leans on a `createdAt`-style field's *value*, not just its
presence — check first, the same way this pass did, rather than trusting the comment.

**A related pitfall found the same way, worth flagging for anyone writing more `communication`
tests**: `communication`'s real business key is `${tenant}:${idempotencyKey}` — computed
independently by both real callers (`ingest.ts`'s `ingestCommunication`) and the `created` event
handler itself, **not** whatever id a caller happens to pass to `consequent.handle()`. Passing a
bare id that doesn't match this composite (e.g. a test creating a communication as if
`idempotencyKey` alone were the actor id) doesn't error — the actor gets stored under the id you
passed, but its own `state.key` field silently reports the *different*, correctly-computed
value. A later `consequent.handle(state.key, ...)` call (exactly what a real caller reading
`.key` off a `find()` result would naturally do) then resolves to a **different, freshly
auto-vivified, unrelated actor instance** — since that composite string had never been used as an
id before — rather than an error. `retention-purge.spec.ts`'s own test helper hit this directly:
every "purge" appeared to succeed (no rejection, since a fresh instance's `payloadPurgedAt` is
always `null`) while the *real* record, fetched by the id the test itself used to create it,
stayed untouched. Fixed by making the test helper compute the same `${tenant}:${idempotencyKey}`
key `ingest.ts` does, matching the real convention rather than assuming a bare id works.

Tested in `spec/behavior/retention-purge.spec.ts`: past-deadline purge, within-window no-op,
already-purged skip, per-`communicationType` independent `retentionDays`, deprecated types never
swept, multi-tenant independence for the same type name, and a no-op against zero communication
types. 7 new tests.

## Three real bugs tower's pilot already found — still true here

1. **`consequent`'s loader only finds compiled `*_actor.js` files** — point `actors` config at
   `dist/actors`, not `src/actors`.
2. **A command handler must reject via a rejected promise, never a synchronous `throw`** —
   `consequent`'s `apply.ts` only wraps a handler's *return value* in
   `Promise.resolve(...).then(onSuccess, onError)`.
3. **Fastify's default AJV options set `removeAdditional: true`** — override with
   `ajv: { customOptions: { removeAdditional: false } }` in every `buildApp()`.

## New bugs/gotchas this pilot found — none of these were visible in tower's slice

Roughly in the order they'd bite someone building the next `consequent`-backed service.

### 4. Command `then` handlers receive the full `ActorInstance` wrapper, not bare state

`apply.js#processCommand` calls `handle(instance, command)` — the *whole* `{ actor, state,
commands, events }` wrapper, not `instance.state`. This is asymmetric with both `when` predicates
(`filterHandlers` explicitly calls `predicate(instance.state, message)`) and *event* handlers
(`processEvent` explicitly calls `handle(instance.state, event)`) — both of those correctly get
bare state. Confirmed with a standalone probe actor (not just log-reading): a command handler's
first parameter really does have `.actor`/`.state`/`.commands`/`.events` on it, and reading a
domain field directly off it (e.g. `state.status`) reads `undefined`.

Tower's own pilot never hit this because none of its command `then` handlers ever read their
first argument (`create`/`update`/`suspend` all either ignore it or only build an event from the
command). Every command handler in herald's actors that needs to inspect current state (existence
checks, guarded transitions beyond what a `when` predicate already covers) destructures
`instance.state` explicitly — see the note at the top of `communication_type_actor.ts` for the
canonical write-up, referenced from every other actor file that needed the same fix.

### 5. Building an event by spreading the command after setting `type` is a live footgun

`consequent`'s own dispatch auto-injects `command.type = topic` (`dispatch.js`: `if
(!message.type) { message.type = topic }`) *before* a command handler ever runs. `return { type:
'x.updated', ...command }` then lets that injected field win — object spread applies in
declaration order, so the *command's own topic string* silently overwrites the intended event
type. The practical effect isn't a wrong field, it's a hang: consequent treats the resulting
"event" as *another command* with that same topic (since `metadata.commands[topic]` also
matches) and reprocesses it through the command dispatcher — forever, on the same queue, for the
same actor id. This pilot's own `sendingConfig.update` command hit this exactly: `PATCH
/sending-config` calls timed out at vitest's 30s ceiling instead of failing cleanly, with no
error anywhere — traced by adding temporary debug prints into `consequent`'s own compiled
`apply.js`/`dispatch.js` (reverted afterward) to watch a single `handle()` call recurse into
itself. Fixed by building every event object's fields out explicitly, never spreading a command
that might carry its own `type`.

### 6. An actor whose `identifiedBy` field doubles as its own existence marker is always "found"

`actors.js#populateActorState` does `if (!copy.state[field]) copy.state[field] = id` for
*every* fetch, including one for an actor that was never actually created — `field` here is
`identifiedBy`. `sendingConfig`'s `identifiedBy: 'tenant'` collided with using `tenant` itself as
the "has this been configured" check, so `GET /sending-config` for a tenant that never PATCHed
anything returned `200` with defaults instead of `404`. Same root cause tower's own
`tenant_actor.ts` comment already flags for `createdAt` vs. `slug` — worth restating because it's
easy to reach for the identifying field again on a *different* actor and not notice, exactly what
happened here. Fixed by adding a dedicated `configuredAt` marker field, separate from `tenant`.

### 7. `consequent`'s own default in-memory adapters are a **module-level singleton**, not
   per-`initialize()`-call state

`consequent/dist/index.js`: `const defaults = { actorStore: defaultActorStore(), ...,
searchAdapter: defaultSearchAdapter() }` is computed *once*, at module import time, and reused by
every `initialize()` call in the process — confirmed with a raw two-`initialize()`-calls repro
script, not assumed. A fresh `consequent` variable per test (`buildInMemoryConsequent()` in
`beforeEach`, the exact pattern tower's pilot established) does **not** mean fresh underlying
storage. `fetch`-by-id assertions are unaffected as long as the exact id string is test-unique;
any `find()`-based list/count assertion silently accumulates data across every test in the same
file that reuses a tenant/type/contactId slug. Worked around throughout this suite by generating
a fresh slug per test (`spec/lib/unique.ts`) rather than hardcoding literals like `'acme'`.

### 8. `consequent`'s own default in-memory search adapter has a real indexing bug

Independent of #7 (which is about *isolation*, this one is about *correctness* even within a
single `initialize()` session): `default/searchAdapter.js#removeFromFieldIndex`'s "this value's
bucket has exactly one id" branch deletes the *entire* bucket — and drops the value from the
field's distinct-values list — without checking that the one id present is actually the id being
removed. Every `addFieldValue` call does an unconditional remove-then-add of a field's value,
*even when the value didn't change* (consequent always passes the full `searchableBy` list to
`search.update`, not just changed fields). Concretely: create two `communicationType` actors
(both default to `status: "active"`), deprecate one — the *other*, completely untouched actor
silently vanishes from the `status: "active"` search bucket, because the deprecated actor's own
redundant remove-then-add of "active" (on its way to "deprecated") finds exactly one id in that
bucket (the other actor's) and wipes it. A `GET .../communication-types` list test caught this as
a wrong count, not a crash — reproduced deterministically with a raw script, traced to the exact
line via instrumented debug prints (reverted). Fixed for the test suite by writing a corrected
in-memory search adapter (`spec/lib/in-memory-search-adapter.ts`) and passing it explicitly to
every `initialize()` call instead of relying on the default. This bug lives in the *default
in-memory* adapter only — real production uses `consequent-postgres`'s SQL-backed search, a
different implementation entirely unaffected by it.

### 9 & 10. `consequent.find()` is fundamentally broken against `consequent-postgres` — two
   stacked bugs, both confirmed against compiled source

> **Fixed upstream, confirmed as of this pass.** `package.json` is pinned to
> `consequent@^2.0.1`/`consequent-postgres@^2.0.4` (resolving to those exact versions in
> `node_modules`) — both patches ahead of the `2.0.0`/`2.0.3` versions this bug was originally
> found against. `spec/integration/herald.integration.spec.ts`'s own header comment already
> documents this ("*** FIXED upstream -- history kept here for context ***") and all six of its
> tests are plain `it`, not `it.fails` — this file's own prose below just hadn't been updated to
> match when this pass started (see the correction under `spec/integration/*` above). Left the
> original write-up intact below as historical record of what was found and how, but treat the
> **Consequence** paragraph's "currently non-functional in production" claim as describing the
> state *before* the upstream fix, not the state today — `contact-lifecycle-consumer.ts`'s
> `find()`-based communication-payload purge sweep (this pass) depends on this being genuinely
> fixed, and `rabbitmq.integration.spec.ts`/`herald.integration.spec.ts` both exercise it without
> issue.

The most severe finding of this pilot, discovered only once the integration tier actually ran
against real Postgres (never visible against any in-memory adapter, fixed or not).

**9. Shape mismatch.** `consequent`'s own public type (`ConsequentApi.find(type, criteria:
Record<string, unknown>)`) says criteria is a flat object — and the default in-memory adapter
accepts exactly that. `consequent-postgres`'s real `SearchAdapter.find` (`dist/search.js`)
instead does `criteria.forEach(set => ...)`, joining each array element's own AND'd conditions
with `OR` — it wants an *array* of criteria sets. Passing a flat object crashes outright:
`criteria.forEach is not a function`. Fixed by wrapping every criteria object in this codebase in
a single-element array (`find(type, [{...}])`) — see `template-lookup.ts#templatesFor`'s comment
for the canonical write-up, referenced from every other call site.

**10. Un-awaited promise.** Fixing #9 stopped the crash but every list/find-backed route still
silently returned nothing against real Postgres. Root cause, confirmed by reading
`consequent/dist/search.js` directly:

```js
function find(manager, adapters, lib, type, criteria) {
  return getAdapter(adapters, lib, type).then((search) => {
    const ids = search.find(criteria);   // never awaited
    if (ids.length) { ... }              // `ids` is a pending Promise here, `.length` is undefined
    else { return Promise.resolve([]); } // ...so this branch is *always* taken
  });
}
```

`consequent`'s own `SearchAdapterInstance` type declares `find` as **synchronous**
(`(criteria) => unknown[]`), which the default in-memory adapter honors. `consequent-postgres`'s
real adapter necessarily does a genuine network round trip and returns `Promise<string[]>` —
`consequent`'s core dispatcher never awaits it, so the truthy check on `.length` always fails and
`find()` returns `[]`, unconditionally, for every type and every query, no matter what's actually
stored. Verified independently with a script that called `pgAdapters.search`'s own adapter
instance directly, bypassing `consequent.find()` entirely — the real query returns the correct
rows every time; the bug is specifically in `consequent`'s own wrapper discarding them.

**Consequence**: every `find()`-backed list/lookup route in this service (and, by the same
mechanism, in tower's or keep's, if either ever exercises `find()` against Postgres) is currently
non-functional in production as pinned (`consequent@2.0.0` / `consequent-postgres@2.0.3`, both
confirmed to be the latest published versions as of this pilot — no patch fixes it yet). This
isn't fixable from application code; it needs an upstream fix (await the adapter's `find()` before
checking `.length`). `spec/integration/herald.integration.spec.ts`'s three `it.fails` tests exist
specifically to keep this visible rather than silently working around it — see that file's own
long comment for the full detail and for why they're `it.fails` rather than `it.skip`.

## New findings from this pass (real RabbitMQ wiring, contact-lifecycle consumer, `server.ts`)

### 11. Tower's only real `comms.*` publisher today uses a stale, pre-encryption payload shape — a live mismatch, not a documentation gap

This pass's brief described tower as not yet publishing `comms.*` at all ("that producer-side work
... is tower's own remaining scope"). Reading tower's actual source
(`tower/src/routes/provisioning.ts`) found otherwise: tower's tenant-provisioning flow already
calls `app.publisher.publish('comms.transactional.invite-sent', { idempotencyKey, tenant,
application, category, type, channel, to, templateData })` — a real, already-shipped publish call,
not a stub.

The problem: that shape is ADR 0022's *original* contract, before ADR 0025 (accepted the same day,
2026-07-24, but layered on top) amended it to move the sensitive fields behind encryption. Herald's
own `IngestMessage` (`src/lib/ingest.ts`) and `communication.create` command
(`src/actors/communication_actor.ts`) are built correctly against the *amended* ADR 0025 contract —
`contactId` (hash), `title`, `templateVersion`, `encryptedPayload`, `payloadKeyVersion` — which is
what every test in this suite (including this pass's new ones) constructs. Tower's actual call site
supplies none of those five fields and instead sends `to`/`templateData` in plaintext, a shape ADR
0025 explicitly says must never reach RabbitMQ unencrypted.

Traced the concrete runtime effect through `communication_actor.ts#create` and
`send-worker.ts#processCommunication`: nothing rejects on ingest (the command handler builds its
event fields positionally, missing ones just become `undefined`), so the record is created
successfully and acked — then `payloadKeyring.get(undefined)` fails to find a generation and the
worker marks it `failed` with "no payload key generation undefined". Concretely: **the
first-admin-invite email tower's own provisioning flow depends on would silently fail to send in a
real deployment today**, not because of anything in this pass's own code, but because tower's
existing publisher and herald's existing (correct, ADR-0025-compliant) consumer contract have
drifted apart. Not fixed here — out of scope for a herald-only pass, and fixing it means changing
tower (encrypt `{ to, templateData }` with herald's public key before publishing, add the four
missing fields) — but worth flagging loudly since it's a currently-live gap between two already-
shipped pieces of code, not a hypothetical.

### 12. `optOut` has no delete/reset command, unlike `suppression`

`suppression_actor.ts` has a `remove` command that resets state back to its all-default shape
(documented there as the "physical delete" idiom this design uses, since consequent has no real
delete primitive). `opt_out_actor.ts` has no equivalent — only `addCategory`/`removeCategory`.
ADR 0024 says a `contact.purged` handler must "delete its opt-out record for that `contactId`
outright." Rather than add a new command to an already-tested actor for one caller's benefit,
`contact-lifecycle-consumer.ts#purgeOptOut` walks the existing, already-idempotent
`removeCategory` command over every category currently on record — converges to the same
"nothing opted out" projected state `remove` would produce, using only vocabulary the actor
already exposes. Functionally equivalent for every current reader of `optOut` state (nothing
distinguishes "never created" from "created, all categories removed" today), but worth naming: if
that ever changes (e.g. an audit view that lists *whether* a contact ever had an opt-out record at
all, not just which categories), this purge path would need revisiting.

## New finding: `signet-admin.ts`'s `pushSecret` silently no-op'd on every real call

### 13. A malformed tar path + an unchecked RPC response made every `pushSecret` call succeed without writing anything

Found live, running `authstar-integration`'s golden-path scenario against a real cluster:
`POST /operator/rotate-keys` reported success (`{"rotated":[{"key":"payload-encryption",
"version":2}],"failed":[]}`), but tower's own subsequent bundle fetch never saw the pushed
`heraldPayloadPublicKey` secret — even from a brand-new tower pod, restarted well after the
push completed, with an explicit `signet repo sync` triggered in between.

Traced all the way through signetd's own real Go source (`~/git/signet`) before finding the
actual defect — signetd itself behaves correctly throughout: `GetServiceBundle` reads the same
table `SyncBundle`/`PutSecret` writes to, synchronously, with no cache, TTL, or reconcile lag
anywhere in between. The bug was entirely in this file: `buildSecretArchive` built the tar
entry path as `secrets/<service>/<key>.yaml` (2 components), but signetd's real
`ParseSecretPath` (`internal/gitops/path.go`) requires exactly 3:
`<namespace>/<service>/<name>.yaml`. `opts.namespace` was received and then explicitly
discarded (`void opts.namespace`) instead of used. signetd doesn't fail the RPC for an
unrecognised path shape — it silently skips the file and reports the problem only in
`SyncBundleResponse.errors`/`secretsAdded`, which `pushSecret`'s callback never inspected
(only the transport-level `err`).

No existing test caught this — every one injects a fake `SignetAdmin`, matching this file's
own header comment ("behavior/e2e tests inject a fake"), so the real wire format was never
exercised until a live signetd was. Fixed identically in both this file and tower's own
`signet-admin.ts` (byte-for-byte the same construction, byte-for-byte the same bug):
`buildSecretArchive` now takes and uses `namespace`, and the new pure `syncBundleFailure`
helper (checking `errors`/`secretsAdded`/`secretsUpdated`) is applied to the RPC response
before resolving. Both are exported and directly unit-tested
(`spec/behavior/signet-admin.spec.ts`) — the archive test parses the real gzipped tar bytes
and asserts the path shape matches signetd's own contract, not just "looks plausible".

**Update**: fixing this surfaced a third, deeper bug — even a correctly-shaped push never
durably persisted, because `pushSecret` wrote the value as plaintext YAML, not real SOPS
ciphertext, and signetd's own periodic reconciler silently rejects a plaintext secret on its
next pass ("sops decrypt: parse sops file: sops metadata not found"). Confirmed this was a
`signet-clients` SDK gap spanning every language (including Go's own reference
implementation), filed as bytepunx/signet-clients#49, and fixed upstream (`encryptForSecret`,
`@bytepunx/signet-client` >=0.6.0). `pushSecret` now fetches the live SOPS public key
(`GetSOPSPublicKey`) and calls `encryptForSecret` before building the archive — see
`authstar-integration`'s own README for live re-verification status.

**Correction to this section's own earlier live-debugging theory, and two more bugs found
and fixed in the same pass**: the original live diagnosis (recorded in
`authstar-integration`'s own README) attributed the 1,300-messages/second infinite
RabbitMQ redelivery loop to tower encrypting every comms event with an undecryptable
ephemeral key, because herald's real public key never reached it. That *is* a real,
separately-fixed bug (above) — but re-reading `send-worker.ts`'s actual code afterward
found it doesn't explain the loop: a decryption failure inside `processCommunication`
(`payloadKeyring.get()` miss, or `decryptPayload` throwing) is caught internally and
turned into a normal `communication.markFailed` outcome, never a thrown exception —
`ingestCommunication` would `ack`, not `nack`, on that path.

The **actual** cause: `communication`'s composite actor id (previously the raw
`${tenant}:${idempotencyKey}` string) routinely exceeds `consequent-postgres`'s
`character(42)` id column — the exact same platform-level constraint tower's own
TESTING.md already documents hitting for contact ids and invite tokens. tower's real
invite-sent publish uses `idempotencyKey: \`invite:${token}:sent\`` (52 characters on its
own, `token` already 40 hex chars) — `${tenant}:${idempotencyKey}` for a real tenant
routinely lands at 50-60+ characters. `communication.create`'s underlying Postgres INSERT
failed with "value too long for type character(42)" identically on every single
redelivery (a genuinely permanent, deterministic failure, not transient), and
`comms-consumer.ts`'s `nack(msg, false, true)` on *any* `ingestCommunication` error (with
the error itself silently swallowed, `.catch(() => {...})`) turned that into an invisible,
unbounded loop.

Both fixed in this same pass:
- **`src/lib/communication-id.ts`** (new) — `communicationActorId(tenant, idempotencyKey)`
  hashes the composite down to a fixed 40-hex-char SHA-1 digest (a hash, not a truncation,
  to avoid two distinct long `idempotencyKey`s colliding after a naive `.slice()`). Every
  call site that used to construct the raw composite directly now goes through this one
  function: `ingest.ts`, `send-worker.ts#processCommunication`, `communications.ts`'s two
  route handlers, and — found along the way, a *third* real bug of the identical shape —
  `retention-purge.ts` and `contact-lifecycle-consumer.ts#purgeCommunicationPayloads` were
  both issuing their `communication.purgePayload` command against `state.key` (a redundant,
  human-readable informational field set once in `created`'s event handler and never used
  as a lookup anywhere else), which after this fix no longer matches the real actor id —
  silently creating and "purging" an unrelated orphaned actor instead of the real one. Both
  now recompute `communicationActorId(state.tenant, state.idempotencyKey)` instead. A real,
  tower-shaped long `idempotencyKey` is now exercised directly against real Postgres
  (`spec/integration/herald.integration.spec.ts`), not just the in-memory tier, since that's
  the only way the `character(42)` constraint itself gets exercised at all.
- **`comms-consumer.ts`** hardened regardless, since no caught `Error` can be reliably
  classified transient-vs-permanent from this function alone: a fresh message gets exactly
  one requeue (`nack(msg, false, true)`); a message that comes back already marked
  `msg.fields.redelivered` (standard AMQP, no new infrastructure needed) is dead-lettered
  instead of requeued again; every failure is logged (`log` defaults to `console.error`,
  not the previous silent no-op). Bounds any *future* permanent-failure class to at most 2
  delivery attempts instead of an unbounded loop, and makes sure the next one is visible in
  logs immediately rather than requiring a live RabbitMQ management-API investigation to
  even notice. Directly unit-tested against a fake `ChannelLike`
  (`spec/behavior/comms-consumer.spec.ts`) — no real broker needed to prove the bounded
  retry, dead-letter, and logging behavior all work.

## Practical implication for the routes/worker as shipped

Every route in this codebase is written the *correct*, `find()`-based way (matching what Story
003/004/005 actually ask for) rather than worked around to dodge bug #10 — the behavior/e2e tiers
prove the routes are internally correct (real `consequent` command/event/search behavior, just
backed by a bug-fixed in-memory adapter), and the integration tier proves exactly which of those
same code paths do/don't currently work end-to-end against real Postgres. Re-running the `it.fails`
integration tests after any future `consequent`/`consequent-postgres` upgrade is the fastest way to
check whether this is still an open issue.

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
- **Operator key rotation** (`POST /operator/rotate-keys`, Story 005) — no bearer-token operator
  auth middleware exists anywhere in this codebase (matches tower's own pilot scope). The
  `PayloadKeyring`/`UnsubscribeKeyring` classes' own `rotate()`/`prune()` methods are real and
  usable, just not wired to an HTTP route.
- **Activity feed** (`GET /tenants/{tenantSlug}/activity`, Story 005) — mirrors tower Story 010's
  event-stream construction; not implemented.
- **Real signet integration, partial as of this pass** — `src/server.ts` now fetches
  `dbConnectionString`/`rabbitmqUrl` from a real signet bundle (`dialWorkload` +
  `GetServiceBundle`, identical pattern to tower's own `server.ts`), and *can* seed
  `PayloadKeyring`/`UnsubscribeKeyring` from bundle secrets (`payloadKeyGenerations`/
  `unsubscribeKeyGenerations`) if present. **But no ADR names herald's actual bundle schema for
  those two secrets** — nothing populates them in any environment today, so in practice
  `server.ts` always falls through to generating an ephemeral keypair/HMAC key at boot (loudly
  logged when it does). This is a real, not-fully-closed gap: a production herald restarting today
  would still orphan every `communication.encryptedPayload` written under the previous boot's
  keypair, exactly the failure mode the additive `PayloadKeyring`/`UnsubscribeKeyring` constructor
  changes in this pass were meant to make possible to *avoid* once the bundle schema exists — the
  schema itself is the missing piece, not the keyring code. `src/lib/credential-store.ts` (tenant
  `credential`/`webhookSecret`) is unchanged, still an in-process stand-in — out of scope for this
  pass (not part of the signet material `server.ts` was asked to source; see ADR 0032's own
  "signet secret, never persisted in herald's own event log" for what its real story would need).
  None of `server.ts`'s own signet/Postgres/RabbitMQ wiring has test coverage (no live
  `kluster`-provisioned cluster was exercised against it) — same scope note tower's own
  `server.ts` carries, for the same reason (see that file's header comment).
- **Real RabbitMQ/amqplib wiring — now built.** `src/lib/build-comms-consumer.ts` and
  `src/lib/build-contact-lifecycle-consumer.ts` connect via real `amqplib`, assert a durable topic
  exchange (`authstar`) and durable queues, and bind the routing keys each consumer cares about
  (ADR 0006's durable-quorum-queue posture for business events — real quorum-queue topology itself
  is expected to be declared via the Messaging Topology Operator's CRDs in git, not hardcoded from
  application code, matching tower's own convention). `src/server.ts` wires both for real.
  Genuinely proven against a real, disposable broker by
  `spec/integration/rabbitmq.integration.spec.ts` (`@testcontainers/rabbitmq`) — see "What's
  covered" above.
- **Retention purge scheduled sweep** — the `communication.purgePayload` command it would call on
  a schedule is implemented and tested directly (and, as of this pass, also called from
  `contact-lifecycle-consumer.ts`'s erasure path); no cron/scheduler wiring exists to call it
  periodically for ordinary retention (ADR 0029), only in response to a `contact.purged` event.
- ~~Auth/permission gating~~ — **now implemented**, see its own section below.
- **Contact lifecycle sync — now built**, with one real limitation. `src/lib/
  contact-lifecycle-consumer.ts` consumes both `contact.purged` and `herald.contact.migrated`,
  behind the same fake-`ChannelLike`-then-real-broker two-tier coverage as `comms-consumer.ts`.
  `contact.purged`: fully round-trip-tested against tower's real, confirmed producer shape (tower's
  actual `DELETE /tenants/{tenantSlug}/contacts/{contactId}` route, read directly from
  `tower/src/routes/contacts.ts`) — routing key `'contact.purged'`, payload
  `{ tenant, contactId, accountId }`, exactly what this consumer expects.
  `herald.contact.migrated`: **no producer exists in tower's codebase as of this pass** — grepped
  `tower/src` for `migrated`/`oldContactId`/`newContactId`, no publish call anywhere, despite ADR
  0076 (2026-08-02) narrating "tower actually publishes `herald.contact.migrated` for the first
  time." The admin-initiated email-change route ADR 0076 describes (`POST
  /accounts/{accountId}/change-email`) isn't in tower's `src/routes/` either. Built and tested here
  strictly against the ADR-documented contract (`{ tenant, oldContactId, newContactId }`,
  `herald.contact.migrated` routing key — *not* generalized to a bare `contact.migrated` the way
  ADR 0026 explicitly generalized the purge message) — genuinely untestable end-to-end against a
  real producer until tower builds that route. Not a gap in this pass's own work; a gap in what
  tower has actually shipped, same honest scoping this platform uses elsewhere.

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

## Practical implication for the routes/worker as shipped

Every route in this codebase is written the *correct*, `find()`-based way (matching what Story
003/004/005 actually ask for) rather than worked around to dodge bug #10 — the behavior/e2e tiers
prove the routes are internally correct (real `consequent` command/event/search behavior, just
backed by a bug-fixed in-memory adapter), and the integration tier proves exactly which of those
same code paths do/don't currently work end-to-end against real Postgres. Re-running the `it.fails`
integration tests after any future `consequent`/`consequent-postgres` upgrade is the fastest way to
check whether this is still an open issue.

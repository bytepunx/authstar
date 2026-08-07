# Testing Conventions

Three tiers, run separately (`npm run test:behavior` / `test:e2e` / `test:integration`), or
together (`npm run test:all`). All three build `src/` to `dist/` first (`pretest`) —
`consequent`'s own actor loader globs for `*_actor.js` and has no awareness of `.ts` at all,
even under `tsx` — so every tier runs against the same compiled artifact the real server would
load, not a test-only path. Same convention tower's own pilot established; nothing new here.

Current status: **89 tests passing** across 12 files — 75 behavior, 7 e2e, 6 integration + `.fails`
(one integration test file mixes 3 genuinely-passing tests with 3 `it.fails` tests that document a
confirmed upstream bug — see below, they're not silently skipped).

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

**Ingestion**, behind a fake `ChannelLike` (no real broker — see "Not covered"): durable creation
on receipt, ack/nack sequencing, idempotent redelivery (same `idempotencyKey` twice is a safe
no-op, not a duplicate send), malformed-message dead-lettering.

**Real crypto**, not stubbed: `src/lib/payload-crypto.ts` is a genuine hybrid RSA-OAEP + AES-256-GCM
envelope scheme (versioned keyring), `src/lib/unsubscribe-token.ts` is a genuine HMAC-signed,
versioned token scheme. Both stand in for signet-managed secrets (see "Not covered").

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
- **Three of the six tests are written with `it.fails`, not skipped** — they document a real,
  confirmed upstream bug (below) that makes `consequent.find()` non-functional against real
  Postgres. `it.fails` keeps the *correct* expected behavior on record and will start failing the
  suite (on purpose) the moment a `consequent`/`consequent-postgres` upgrade actually fixes it,
  which is the signal to flip them back to plain `it`.
- Needs Docker running locally / in CI. `beforeAll`'s own timeout is generous (60s+).

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
- **Real signet integration** — `src/lib/credential-store.ts` (tenant `credential`/
  `webhookSecret`) and the payload-encryption/unsubscribe-signing keyrings are all documented,
  in-process stand-ins, generated fresh per run and never persisted. Real deployment sources all
  of these from signet; that wiring doesn't exist here.
- **Real RabbitMQ/amqplib wiring** — `src/lib/comms-consumer.ts` depends on a minimal
  `ChannelLike` structural interface, tested against a fake channel (per this project's explicit
  scope: "you don't need a real broker... a bonus, not a requirement"). No `server.ts` entrypoint
  exists to actually connect to a broker.
- **Retention purge scheduled sweep** — the `communication.purgePayload` command it would call is
  implemented and tested directly; no cron/scheduler wiring exists to call it periodically.
- **Auth/permission gating** (`communication-types:manage`, `sending-config:manage`, etc.) — no
  JWT/permission middleware exists anywhere in this codebase, matching tower's own pilot.
- **Contact lifecycle sync** (`herald.contact.migrated`/`herald.contact.purged` RabbitMQ
  consumers) — explicitly out of scope per Story 001/004's own "Not Covered Here" sections.

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

## Practical implication for the routes/worker as shipped

Every route in this codebase is written the *correct*, `find()`-based way (matching what Story
003/004/005 actually ask for) rather than worked around to dodge bug #10 — the behavior/e2e tiers
prove the routes are internally correct (real `consequent` command/event/search behavior, just
backed by a bug-fixed in-memory adapter), and the integration tier proves exactly which of those
same code paths do/don't currently work end-to-end against real Postgres. Re-running the `it.fails`
integration tests after any future `consequent`/`consequent-postgres` upgrade is the fastest way to
check whether this is still an open issue.

# Testing Conventions

Three tiers, run separately (`npm run test:behavior` / `test:e2e` / `test:integration`), or
together (`npm run test:all`). All three build `src/` to `dist/` first (`pretest`) — `consequent`'s
own actor loader globs for `*_actor.js` and has no awareness of `.ts` at all, even under `tsx` —
so every tier runs against the same compiled artifact the real server loads, not a test-only path.
Same convention as tower's pilot (`~/git/authstar/tower/TESTING.md`), extended for keep's Stripe/
entitlement-publishing dependencies.

## `spec/behavior/*.spec.ts` — API contract

- `fastify.inject()` against a real fastify instance — no real network.
- Backed by **explicit, freshly-constructed in-memory `consequent` adapters**
  (`spec/lib/memory-adapters.ts` + `spec/lib/in-memory-consequent.ts`) — real `consequent`
  command/event/search behavior, not mocked responses, just not Postgres-backed. **Not**
  consequent's own built-in in-memory defaults — see gotcha #1 below for why.
- Stripe, the tower-sourced role reference cache, and entitlement publishing are all faked
  behind their own interfaces (`spec/lib/fake-stripe-client.ts`,
  `src/lib/role-reference-cache.ts`, `src/lib/entitlement-publisher.ts`'s in-memory
  implementations) — one shared builder, `spec/lib/test-app.ts`, assembles all of it per test.
- One file per route group (`plan-mappings`, `webhooks`, `checkout-sessions`, `billing-reads`,
  `trials`, `coupons`, `usage`, `stripe-config`), asserting exactly what's in the corresponding
  Story's acceptance criteria.

## `spec/e2e/*.spec.ts` — full flows, still no external dependencies

- Same in-memory `consequent` instance as behavior tests, but exercises a realistic *sequence*
  of calls through the HTTP surface — `subscription-lifecycle.spec.ts` (stripe-config → plan
  mappings → checkout → webhook create → upgrade → cancel) and
  `trial-and-dispute-lifecycle.spec.ts` (trial grant → extend → webhook-driven conversion →
  dispute degrade → dispute-won restore).

## `spec/integration/*.integration.spec.ts` — real dependencies, this service only

- Real Postgres via `testcontainers` (`@testcontainers/postgresql`), real `consequent-postgres`
  adapters — proves the actual storage wiring works, not just the in-memory fake. Stripe/role-
  cache/entitlement-publishing stay faked here too — scoped to "real Postgres, nothing else,"
  same as tower's own integration tier.
- **Scoped to what these library versions can actually prove** — see gotcha #6. `fetch()`-by-id
  routes get real HTTP-level assertions; where a route depends on `consequent.find()`, the test
  verifies the underlying Postgres row directly instead of asserting through a route that's
  currently broken for reasons that have nothing to do with keep's own code.
- **Close adapters before stopping the container**, not after — same ordering tower's own
  integration tier documents (`pgAdapters.close()` then `container.stop()`).
- Needs Docker running locally / in CI.

## What's covered vs. left for a follow-up pass

**Fully implemented, all 3 tiers passing (70 tests: 65 behavior, 2 e2e, 3 integration) as of the
original pilot slice; see "Scope covered by the amqplib/server.ts pass" below for what a later
pass added on top:**

- All 9 Story 001 actors: `customer`, `planMapping`, `subscription`, `trial`, `coupon`,
  `usageRecord`, `usageReportingCredential`, `refund`, `dispute`.
- Story 002 (Stripe webhook handling) — the full event table: `checkout.session.completed`,
  `customer.subscription.created`/`.updated`/`.deleted`, `invoice.payment_failed`,
  `charge.refunded`, `charge.dispute.created`/`.closed` (won/lost), `account.updated` (ignored).
  Entitlement publishing (`converted-to-paid`, `role-granted`/`role-revoked` as a delta on
  upgrade, `seat-limit-changed`, one shared sequence per tenant/scope) is real and tested.
- Story 003 (plan mappings, checkout sessions, billing reads) — full CRUD + retire-alias +
  reference-cache role validation, checkout session creation with customer reuse, all read-only
  surfaces including `revenue-summary`'s MRR computation.
- Story 004 (trials and coupons) — full CRUD, extend/reissue, revoke, webhook-driven conversion,
  composite-key (`{tenant}:{code}`) duplicate rejection.
- Story 005 (usage records and credentials) — recording with meter validation and idempotency,
  admin list/detail, credential issuance/listing/revocation.
- Story 006 — `stripe-config` GET/PATCH with set-time validation (write-only, never returns the
  secret). `GET /me/subscription` and `GET /tenants/{tenantSlug}/activity` are **not**
  implemented (see below).

**Deliberately left uncovered (explicit follow-up, not partial/broken work):**

- `GET /me/subscription` (Story 006) — resolves off a forwarded internal JWT keyed by
  portcullis; no JWT verification path exists in this slice at all (no `jose` wiring), and
  faking one convincingly felt like a separate, real piece of work rather than a quick add.
- `GET /tenants/{tenantSlug}/activity` (Story 006) — same `getEventStream`-across-actor-types
  mechanism as tower Story 010, reused rather than re-derived per that story's own text; not
  implemented here purely for time, not because it's hard.
- `POST /_authstar/usage-reports` (Story 005's batched/credential-authenticated ingress, ADR
  0079) — needs portcullis's own `Host`-resolved application context to cross-check the
  credential against; the shared handler both ingress paths call
  (`POST /tenants/{tenantSlug}/usage-records`) *is* implemented and tested directly.
- The `grantedRoles` reference cache's tower-polling backfill (`src/lib/role-reference-cache.ts`)
  — still an injectable interface with in-memory implementations only; `src/server.ts` (see
  below) boots it with an empty snapshot rather than block on this unbuilt poller, so every
  `grantedRoles` validation rejects in a real deployment until it's built. No keep story
  specifies the polling mechanism yet.
- Entitlement sequence numbers (`SequenceProvider`) are in-memory only — correct within one
  process's lifetime (what every test needs), not durable across a restart. A real deployment
  needs this backed by something that survives one (a dedicated actor, a Postgres counter table)
  — no keep story specifies the mechanism yet, so nothing to build against.
- The periodic plan-mapping pricing re-sync job (Story 003) — the `syncPricing` actor command
  exists and is exercised implicitly by nothing yet; the actual `CronJob`-style scheduler isn't
  built.

## Scope covered by the amqplib/server.ts pass

Closes the two gaps the original pilot slice explicitly left open: real RabbitMQ publishing and
a real production entrypoint. All 3 tiers still pass, now 74 tests total (65 behavior, 2 e2e, 7
integration — up from 3, see below).

- **`src/lib/amqp-entitlement-publisher.ts`** — the real `amqplib`-backed
  `createAmqpEntitlementPublisher`, publishing onto the exact same durable topic exchange
  (`authstar`, `durable: true`, ADR 0006's must-not-lose tier) tower's own
  `entitlement-consumer.ts` binds `entitlement.#` against — confirmed directly against tower's
  `src/server.ts`, not assumed. Routing key is each event's own `type` field
  (`entitlement.<eventType>`); the published payload strips `type` before serializing, matching
  tower's `EntitlementEnvelope` shape (which carries no `type`/`eventType` field of its own —
  the routing key alone conveys which event arrived, per ADR 0031). `persistent: true`, same as
  tower's own `createAmqpPublisher`.
- **`src/server.ts`** — real production entrypoint, following tower's own `src/server.ts`
  pattern exactly: signet bundle fetch (`dialWorkload` + `getServiceBundle`), real
  `consequent-postgres` adapters, a real `amqplib` connection asserting the `authstar` exchange
  and wiring it into the entitlement publisher, a real Stripe client factory
  (`createStripeClientFactory`), fastify app start, then racing `SIGTERM`/`SIGINT` against
  `waitForRestart`'s coordinated-restart lock. Not live-validated against a real cluster (see
  below) — same scope decision tower's own `server.ts` documents.
- **`src/lib/signet-stripe-config-store.ts`** — real signet wiring for `stripe-config`
  (ADR 0052), filling the gap `src/routes/stripe-config.ts`'s own header comment flagged as
  out of scope. `get()` reads from a startup snapshot of keep's own decoded bundle secrets;
  `set()` pushes both secrets via `GitOpsService.syncBundle`, using the same minimal
  tar.gz-archive-then-gzip approach as tower's `signet-admin.ts` (`pushSecret`), adapted to
  ADR 0052's narrower "own bundle only" token scope (no `targetService` parameter, no
  `secrets/<service>/` prefix). Carries the identical plaintext-not-SOPS-encrypted caveat
  tower's own file documents — not resolved here either.
- **`spec/integration/entitlement-publishing.integration.spec.ts`** — the new real-RabbitMQ
  integration coverage (`@testcontainers/rabbitmq`, matching the exact devDependency version
  chronicle's own RabbitMQ integration tier pins). `consequent` stays in-memory and Stripe
  stays faked here — scoped to this one dependency (RabbitMQ), same reasoning chronicle's own
  `rabbitmq.integration.spec.ts` documents for not combining multiple real dependencies in one
  test. Genuinely passes against a real broker: a checkout-driven webhook publishes
  `entitlement.converted-to-paid` and `entitlement.role-granted` onto the real `authstar`
  exchange, a separate consumer connection (standing in for tower's real consumer) binds
  `entitlement.#` and receives both messages with the exact envelope shape tower's consumer
  expects (`type` field absent, `sequence` monotonic per tenant/scope), `deliveryMode: 2`
  (persistent) is confirmed on the wire, and a queue bound to an unrelated routing key
  (`entitlement.seat-limit-changed`, which this account-scoped subscription never fires)
  receives nothing.

**Deliberately deferred in this pass, same "documented, not silently glossed over" discipline as
above:**

- **Live signet/RabbitMQ/Postgres/SPIFFE validation** — `src/server.ts` was not run against a
  real `kluster up --profile authstar` cluster. Every I/O boundary it wires is exercised for
  real only through its own injected interface's test double or (Postgres, RabbitMQ) this
  repo's own integration tier against disposable, real infrastructure — `server.ts` itself has
  no test coverage of its own, consistent with how tower's own entrypoint is scoped.
- **`signet-stripe-config-store.ts`'s real `SyncBundle` RPC** — real request shape, real
  streaming, real auth, but never exercised against a live signet server (no fake signet server
  in this repo to test against) — same gap tower's own `signet-admin.ts` has.
- **The `grantedRoles` reference cache poller and `SequenceProvider` durability** — both listed
  above as already-deferred from the original pilot slice; `src/server.ts` wires them exactly as
  they exist today (empty snapshot, in-memory counters) rather than building the missing pieces,
  since no keep story specifies either mechanism yet and this pass's scope was the two gaps
  named at the top of this section.

## Six real gotchas this pilot found — worth knowing before writing more services' tests

The first three are carried over from tower's own pilot (still true, still worth restating
here since every consequent-based service hits them). The rest are new — found specifically
because keep uses `find()`/composite keys/multi-word actor types far more than tower's single-
actor pilot slice did.

1. **`consequent`'s loader only finds compiled `*_actor.js` files** — point `actors` config at
   the *compiled* directory (`dist/actors`), never `src/actors`. Getting this wrong loads zero
   actors with no clear error.
2. **A command handler must reject via a rejected promise, never a synchronous `throw`.**
   `consequent`'s `apply.ts` only wraps a handler's *return value* in a promise chain — a
   synchronous throw hangs the actor's command queue.
3. **Fastify's default AJV options set `removeAdditional: true`** — override with
   `ajv: { customOptions: { removeAdditional: false } }` in every `buildApp()`, or an
   `additionalProperties: false` schema silently strips unknown fields instead of rejecting.

4. **A produced event's `type` must be exactly `${actor.type}.${eventName}`, using the actor's
   literal (often camelCase) `type` string — not a kebab-case or otherwise "friendly" variant.**
   `consequent`'s loader (`loader.js`'s `processHandles`) auto-prefixes any dot-free event-
   handler key with the actor's own `type` (`'planMapping'`, not `'plan-mapping'`) to build the
   lookup key `apply()` uses when dispatching a produced event to its handler. A command handler
   that emits `type: 'plan-mapping.created'` for an actor whose `type` is `'planMapping'`
   produces an event nothing ever handles — the command still "succeeds" (rejects nothing), the
   state just silently never updates, no error anywhere. Tower's own actors are all single-word
   (`tenant`), so this trap never existed for that pilot; keep's multi-word actor types
   (`planMapping`, `usageRecord`, `usageReportingCredential`) hit it immediately.

5. **Never store domain data in an event's own `id` field — consequent overwrites it
   unconditionally, and the bug this causes only shows up on the *next* fetch, not the one that
   created the record.** `dispatch.js`'s `enrichEvent` does `event.id = flakes()` on every
   produced event, right before persisting it — `event.id` is reserved for the event's own
   stream identity. Three of keep's actors (`customer`, `planMapping`, `trial`, all
   `identifiedBy: 'id'`) originally had their `created` event handler do `state.id = event.id`,
   intending to copy the actor's own id through. This is unnecessary in the first place —
   consequent's own `populateActorState` (`actors.js`) already sets `state[identifiedBy]` to the
   id `fetch`/`handle` was called with, before any event handler runs — but it's also actively
   wrong: during the *live* command dispatch that creates the record, `event.id` still holds
   whatever the command handler set (enrichment happens *after* event handlers run), so the
   bug is invisible in the immediate return value. The very next `fetch()` replays the
   *persisted* (already-enriched) event from the store, and `state.id` gets silently overwritten
   with a random flake with no event history behind it. Found by a test that fetched right after
   creating and got back a plausible-looking but wrong id — not from reading the source.

6. **`consequent-postgres`'s search adapter needs `criteria` as an array of OR'd AND-groups
   (`Record<string, unknown>[]`); consequent's own default in-memory adapter (and its own public
   type) treats `criteria` as a flat object.** Confirmed against `consequent-postgres`'s own
   `dist/types.d.ts` (`find: (criteria: SearchCriteria[]) => Promise<string[]>`) and its
   `dist/search.js` (`criteria.forEach(set => ...)`). A flat `{tenant: 'acme'}` object works
   perfectly against the in-memory tiers and throws `criteria.forEach is not a function` the
   moment it hits real Postgres. Every `consequent.find()` call site in this codebase goes
   through `src/lib/consequent-types.ts`'s `searchCriteria()` helper (wraps in a one-element
   array) so both tiers use the same calling convention — `spec/lib/memory-adapters.ts`'s own
   fake search adapter was updated to accept (and correctly OR across) the same array shape,
   rather than leaving the two tiers exercising genuinely different code paths.

   **A second, more serious bug sits directly underneath this one, and it's not keep's to fix:**
   `consequent`'s own `search.js` (the wrapper every `consequent.find()` call actually goes
   through, regardless of which adapter is configured) never awaits the adapter's `find()`:
   ```js
   const ids = search.find(criteria);
   if (ids.length) { ... } else { return Promise.resolve([]); }
   ```
   This is silently correct against consequent's own default in-memory adapter, whose `find()`
   really is synchronous. `consequent-postgres`'s adapter is `async` (confirmed against its own
   declared and implemented signature) — so `ids` is an unawaited `Promise`, `ids.length` is
   `undefined`, and **`consequent.find()` returns an empty array unconditionally against a real
   Postgres-backed instance, no matter what's actually stored.** Verified directly: after a
   `planMapping.create` command, the row lands correctly in Postgres (confirmed via a raw query
   against the search table's `fields` column and the id-mapping table) — the *write* path is
   entirely correct, `consequent.find()` itself just never sees it. This affects every
   `find()`-backed route in this codebase (and would affect tower's and any future herald route
   the same way) the moment it runs against real Postgres with `consequent@2.0.0` +
   `consequent-postgres@2.0.3` (the exact versions `design/docs/tech-stack.md` pins) — not
   something a single service's own code can work around, since the bug is inside `consequent`'s
   own package. Flagged here for whoever owns the decision to patch it upstream (or via
   `patch-package`) before any of these services' list/search routes can be trusted against a
   real Postgres-backed deployment. The integration tier's own tests are scoped around this
   (see above) rather than silently asserting against a route that doesn't actually work yet.

## A related, non-bug design quirk worth knowing

`scope` (`{ account: string } | { tenant: string }`) appears in several actors' `searchableBy`
per the Story 001 spec, but an object-valued field can't be meaningfully indexed by either
search adapter used here — both index by using the field's *value* as a lookup key, and a JS
object stringifies to the same key (`"[object Object]"`) for every record; Postgres's version
would similarly need the exact same JSON serialization to match, which isn't reliable across
differently-ordered keys. Every route in this codebase that needs to resolve "the record for
this scope" works around it the same way: `find()` by an indexed *scalar* field (`tenant`) and
filter to the matching `scope` in application code (`src/lib/scope.ts`'s `scopesEqual`) — never
`find({ scope })` directly.

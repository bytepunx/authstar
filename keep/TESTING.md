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

## `spec/live/*.spec.ts` — real Stripe test-mode API, opt-in only

- Run with `npm run test:live` (not part of `npm test`/`test:e2e`/`test:integration`, though
  `npm run test:all`'s unfiltered `vitest run` does pick it up). Requires
  `STRIPE_LIVE_TEST_SECRET_KEY` (a real `sk_test_`/`rk_test_` key from a free Stripe account,
  https://dashboard.stripe.com/test/apikeys — test mode needs no business verification or bank
  details) to be exported before running. Every spec file is wrapped in
  `describe.skipIf(!process.env.STRIPE_LIVE_TEST_SECRET_KEY, ...)`, so the suite skips cleanly
  (not a failure) when the var is unset — safe to leave wired into a CI job with no Stripe
  credentials configured. `spec/lib/live-stripe-app.ts`'s `liveStripeSecretKey()` also fails
  closed if the value doesn't start with `sk_test_`/`rk_test_`, so a live-mode key pasted in by
  mistake can't accidentally run this suite against real money.
- **What this tier exists to catch, that the fake client (`spec/lib/fake-stripe-client.ts`)
  structurally cannot**: its own header comment says signature verification is "a simple
  sentinel check (`valid:<webhookSecret>`), not real HMAC." That means nothing in
  `spec/behavior`/`spec/e2e` ever exercises the installed `stripe` SDK's actual
  `webhooks.constructEvent` — its real signature-header parsing, timestamp-tolerance
  enforcement (Stripe's default is 300s; keep passes no override, `stripe-client.ts:131`), or
  rejection of a tampered payload/wrong secret. Likewise `getPrice`/`createCheckoutSession`/
  `validateApiKey` against the fake only prove keep's request/response *mapping* code compiles
  against a shape this codebase hand-wrote itself, not that it matches what Stripe's real API
  actually returns.
- **No webhook endpoint is registered in Stripe's dashboard for this tier, deliberately.**
  `stripe.webhooks.generateTestHeaderString`/`constructEvent` treat the webhook secret as a
  plain shared string used for local HMAC-SHA256, not something tied to a registered endpoint
  (confirmed against the installed SDK's own types, `node_modules/stripe/types/Webhooks.d.ts`)
  — `stripe-live.spec.ts` picks its own constant and uses it on both sides (generating the test
  signature, and configuring the tenant's `stripeConfig`).
- Creates one real (test-mode) Price via `stripe.prices.create()` in `beforeAll`, used by the
  `getPrice`/`createCheckoutSession` specs; archives the Price and its Product in `afterAll`
  (best-effort — Stripe Prices can't be hard-deleted once created, only deactivated).
- Needs network access to `api.stripe.com` and a real (test-mode) Stripe account.

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
- ~~The `grantedRoles` reference cache's tower-polling backfill~~ — **now implemented**, see its
  own section below.
- ~~Entitlement sequence numbers (`SequenceProvider`) are in-memory only~~ — **now durable**, see
  its own section below.
- ~~The periodic plan-mapping pricing re-sync job~~ — **now implemented**, see its own section
  below.
- ~~Full RBAC/permission enforcement~~ — **now implemented**, see its own section below.

## Scope covered by the amqplib/server.ts pass

Closes the two gaps the original pilot slice explicitly left open: real RabbitMQ publishing and
a real production entrypoint. All 3 tiers still pass (74 tests: 65 behavior, 2 e2e, 7
integration — up from 3, see below); Story 007's permission-enforcement pass on top of this
brings behavior to 71, for 80 total (see its own section below).

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
- ~~The `grantedRoles` reference cache poller and `SequenceProvider` durability~~ — **both now
  implemented**, see their own sections below.

## Permission enforcement middleware (Story 007) is now implemented

`src/lib/permissions.ts`'s `requirePermission(grant)` is a route `preHandler`, identical
mechanism to tower's own Story 014 (no keep-specific self-action exemption -- ADR 0070 is a
tower-only concept, keep has no account/identity model of its own). Verification runs through
`@bytepunx/authstar-fastify` (published to npm, unblocking this), registered globally in
`build-app.ts` with `required: false` so `requirePermission` decides every failure mode as one
generic 403. Tenant resolution for JWKS is ADR 0089's `perTenantJwksKeyProvider`, reading the
tenant hint off the internal JWT's own protected header; the default `authstarGetKey` in
`build-app.ts` uses a new `baseDomain` field on `BuildAppOptions` (`src/server.ts` sources it
from the signet bundle, same field name/fallback as tower's `ProvisioningConfig.baseDomain`).

Applied per this repo's own story 007's route table, with one correction found implementing it
(not a silent guess -- see `src/routes/usage.ts`'s own header comment): usage-credential
issue/list/revoke are gated by `applications:manage`, **not** `billing:manage` as story 007's
table originally (incorrectly) grouped them -- Story 005's own text is explicit and reasoned
("not a billing permission, since this is squarely application-level operational config," ADR
0079) and takes precedence as the more specific source. The design repo's Story 007 has been
corrected to match. `POST /tenants/{tenantSlug}/usage-records` is deliberately **not** gated by
`requirePermission` at all -- its two real callers (portcullis's synchronous usage path, keep's
own not-yet-implemented credential-verified batched path) never carry a tenant-admin's internal
JWT (Story 005's "two distinct callers, two distinct auth mechanisms").

Test coverage: `spec/lib/internal-jwt.ts` mints locally-signed tokens against a throwaway
keypair (no real JWKS fetch in tests); `spec/lib/test-app.ts`'s `buildTestApp()` wires it in and
exposes a `headers()` helper every behavior/e2e spec now uses. 403 coverage isn't exhaustive
across every route (that would mostly duplicate the same assertion tower's own Story 014 tests
already demonstrate) -- a representative case is covered per distinct grant (`billing:manage`,
`billing:read`, `applications:manage`) including the missing-token, wrong-grant, and
degraded-token cases, in `stripe-config.spec.ts`/`billing-reads.spec.ts`/`usage.spec.ts`.

## The `grantedRoles` reference cache (ADR 0047) is now implemented

`src/lib/role-reference-cache.ts` is no longer a fixed, injectable snapshot -- it's a real,
tenant-scoped, mutable cache (`upsertApplication`/`upsertRoleDefinition`), kept current two ways:

- **`src/lib/role-reference-consumer.ts`** — a RabbitMQ consumer on tower's
  `application.<created|hosts-changed|suspended|deleted>`/`roleDefinition.<created|retired>`
  events, keep's first consumer of any kind (it only ever *published* to RabbitMQ before this
  pass). Bound to a new `keep.role-reference` queue on the same `authstar` topic exchange
  (`ENTITLEMENT_EXCHANGE`, confirmed the same exchange name tower's own publisher asserts) keep's
  entitlement publisher already uses -- `assertExchange` is idempotent, so whichever service
  boots first creates it. Both event families carry their current `status` directly in every
  payload (not just
  the specific transition), so the consumer never switches on the routing key's exact suffix --
  it just upserts whatever `status` says, uniformly, for every message on either family. Mirrors
  tower's own `entitlement-consumer.ts` `ChannelLike` convention exactly (fake-channel tests, no
  real broker) — `spec/behavior/role-reference-consumer.spec.ts`.
- **`src/lib/role-reference-backfill.ts`** — catches up on state that predates keep's own
  uptime (a fresh queue binding never sees RabbitMQ messages published before it existed).
  **A deliberate, documented deviation from ADR 0047's literal "one-time startup, across
  everything" framing**: tower has no endpoint that lists every tenant on the installation (only
  per-tenant lookups), so an eager whole-installation sweep at boot isn't buildable against
  tower's actual current API surface. What's implemented instead is **per-tenant,
  on-first-touch**: `ensureFresh(tenant)` is called from `plan-mappings.ts`/`trials.ts`/
  `coupons.ts` right before validating `grantedRoles`, backfills that tenant only the first time
  in the process's lifetime, and is a no-op afterward (the live consumer above keeps it current).
  `refreshAll()` (wired into `server.ts` on a 5-minute interval) is the ADR's own "periodic
  re-run as a safety net," re-checking every tenant already known — guards against a missed
  RabbitMQ delivery, not against never having backfilled. A failed backfill attempt never marks
  the tenant done, so the next request for it retries automatically; in the meantime, validation
  against an empty/stale cache fails closed, the same safe default this cache always had (it used
  to boot permanently empty — now it's only *transiently* empty, once, per tenant, in the worst
  case). See that file's own header comment for the full reasoning. Uses global `fetch` (Node
  22+, already this repo's engine floor) against a new required `towerBaseUrl` signet bundle
  field — no new HTTP client dependency. Tested via an injected `TowerReferenceClient` fake, no
  real HTTP and no `fetch` mocking — `spec/behavior/role-reference-backfill.spec.ts`.
- **`spec/behavior/plan-mappings-role-backfill-wiring.spec.ts`** — proves the route-level wiring
  itself (not just the cache/consumer/backfill modules in isolation): builds the app directly
  with a real, non-no-op `RoleReferenceBackfill` and asserts a role invalid before `ensureFresh`
  runs is accepted once it does, that the request's own tenant (not a hardcoded one) is passed,
  and that PATCH only triggers it when `grantedRoles` is actually in the body.
- **`spec/behavior/role-reference-cache.spec.ts`** — the cache's own unit-level contract
  (tenant isolation, application-inactive invalidates every role under it, `validateAll` reports
  every invalid entry not just the first), previously only exercised indirectly.

**A necessary breaking change to `RoleReferenceCache`'s own shape**, worth calling out since it
touched every existing caller: `isValid`/`validateAll` now take a `tenant` as their first
argument (ADR 0047 requires the cache be tenant-scoped; the old signature had no way to express
that). Updated at all four call sites (`plan-mappings.ts` x2, `trials.ts`, `coupons.ts`) and in
every test that constructs a snapshot directly (`spec/lib/test-app.ts`'s `defaultRoleSnapshot`,
both `spec/integration/*.integration.spec.ts` files) — the snapshot shape itself is now nested
one level deeper (`{tenant: {application: [roles]}}`, was `{application: [roles]}`). `buildApp()`
falls back to a no-op `RoleReferenceBackfill` (`createNoopRoleReferenceBackfill`) when none is
injected, so every pre-existing test that pre-seeds `roleCache` directly and never touches
`roleBackfill` needed zero changes beyond the tenant-scoping above.

## `SequenceProvider` durability is now implemented

`entitlement-publisher.ts`'s `SequenceProvider.next()` is now backed by a real, durable
`entitlementSequence` consequent actor (`src/actors/entitlement_sequence_actor.ts`,
`src/lib/consequent-sequence-provider.ts`'s `createConsequentSequenceProvider`) — was in-memory
only, resetting to zero on every restart. `next` became `async` (was synchronous), rippling
through `await` at all 7 call sites (`plan-mappings.ts` x1, `trials.ts` x3, `webhooks.ts` x3,
`usage.ts` x1); `createInMemorySequenceProvider` (still used by every existing test) keeps its
synchronous internals but now returns a resolved promise, so no test needed to change beyond
adding `await`.

**A real concurrency bug found and fixed while building this, worth flagging beyond keep --
tower independently rediscovered the identical root cause building ADR 0047's applications/
role-definitions routes (see tower's own TESTING.md), so this is evidently a `consequent`-wide
characteristic, not a one-off**: `consequent`'s per-actor command queue does NOT, by itself,
serialize concurrent `handle()` calls into a correct fetch-modify-write cycle. Checked directly
against `consequent`'s own `dispatch.js`/`manager.js`, not assumed: `handle()` calls
`manager.getOrCreate(type, id)` -- a fresh fetch-and-replay-events read -- *before* entering its
queue; only the later `apply()`/`processCommand` step is queued, and it operates on whichever
already-fetched `instance` object that specific `handle()` call captured. Reproduced directly:
firing 10 concurrent `next()` calls for the same (tenant, scope) key, before any fix, all 10
returned `1` -- every one of them fetched the same pre-write `value: 0`, computed `0 + 1`, and
persisted independently, with `consequent`'s in-memory event store's `storeEvents` (a plain
unconditional append, no expected-version check) accepting all 10 with no conflict. Fixed with a
plain in-process, per-key promise-chain mutex built directly into
`createConsequentSequenceProvider` (no new dependency) -- concurrent `next()` calls for the same
key now serialize through it before any of them reach `consequent.handle()`. Sufficient for the
realistic threat model (one keep process handling concurrent requests for the same tenant/scope)
but explicitly **not** a fix for a genuinely distributed race across multiple keep replicas --
that would need real DB-level optimistic concurrency control, which `consequent-postgres`
doesn't provide at all (checked directly: `storeEvent` is a plain `INSERT`, no version check),
and isn't invented here. Accepted as tolerable specifically for entitlement sequence numbers:
ADR 0031's own consumer-side gap detection already treats a gap as "maybe missed a message,
re-fetch to be sure," not a fatal error -- a rare cross-replica double-issued number degrades to
that same already-tolerated case. See `consequent-sequence-provider.ts`'s own header comment for
the full write-up.

Test coverage: `spec/behavior/consequent-sequence-provider.spec.ts` -- monotonic increment, one
counter per (tenant, scope) with real isolation across tenants/scopes, a direct read of the
actor's own persisted state (proving real durability, not just interface behavior), and the
concurrency regression itself (10 concurrent `next()` calls for the same key resolving to
`[1..10]` with no duplicates, not the pre-fix all-`1`s).

## The periodic plan-mapping pricing re-sync job (Story 003) is now implemented

Two pieces, matching this design's own established split between "testable core logic" and
"real-infrastructure entrypoint with no test coverage of its own" (the same split every other
authstar service's own entrypoint already follows):

- **`src/lib/pricing-sync.ts`**'s `syncAllPlanMappingPricing(consequent, stripeClients,
  stripeConfig, log?)` — the real, tested sweep. Finds every `active` `planMapping`
  (`consequent.find('planMapping', searchCriteria({status: 'active'}))` — a retired mapping is
  never touched, since it can't accept new subscribers and a stale cached price on it is
  historical, not live), resolves each one's tenant's Stripe config, re-fetches its price, and
  issues the pre-existing (previously never-called) `planMapping.syncPricing` command if
  `unitAmount`/`currency`/`interval` has drifted. A per-mapping failure (bad Stripe key, deleted
  price, transient network error) is collected into the result, not thrown — one tenant's broken
  configuration never aborts the sweep for every other tenant. No separate "list every tenant"
  mechanism needed (unlike `role-reference-backfill.ts`'s own documented gap) — the set of
  tenants to check falls straight out of which tenants own an active `planMapping` in the first
  place. Tested directly against the in-memory `consequent`/fake Stripe client/in-memory
  `StripeConfigStore` this repo's other specs already use —
  `spec/behavior/pricing-sync.spec.ts`: drift detection (`unitAmount` alone, and separately
  `currency`/`interval`), no-op when nothing changed, retired mappings skipped, per-mapping error
  isolation (one bad price doesn't block a good one), a tenant with no Stripe config recorded as
  an error rather than thrown, multi-tenant independence, and a no-op against zero active
  mappings.
- **`src/sync-pricing.ts`** — the standalone CronJob entrypoint. Mirrors `src/server.ts`'s exact
  startup sequence (`dialWorkload` → `getServiceBundle` → decode secrets →
  `initializePostgresAdapters`/`initializeConsequent` → `createStripeClientFactory()` →
  `createSignetStripeConfigStore(...)`) but skips the Fastify/RabbitMQ/role-cache/
  `waitForRestart` machinery entirely — there's nothing long-lived here for a signet bundle
  change to interrupt. Calls `syncAllPlanMappingPricing` once, logs the result (and every
  per-mapping error to stderr), closes the Postgres/workload handles, and calls `process.exit`
  explicitly (0 if no errors, 1 if any — a Kubernetes-level "did this firing succeed" signal, not
  silently reporting success regardless of what happened underneath). Compiles into the exact
  same `dist/` output `src/server.ts` does — no second image to build/version. **No test coverage
  of its own**, same scope note every other authstar service's real entrypoint carries (signet/
  Postgres/Stripe wiring only exercised for real through the injectable interfaces
  `pricing-sync.ts`'s own tests fake, or this repo's Postgres integration tier).

**The Kubernetes wiring** — `~/git/authstar/integration/manifests/11-keep-pricing-sync-
cronjob.yaml` (a sibling repo to this one) — confirmed directly against kluster's own
`rabbitmqProvisionerCronJobManifest`/`rabbitmqProvisionerPodSpec` (`kluster-lib/profile/
authstar.go`) before writing, not assumed: **no Helm chart exists anywhere in this workspace**
for any authstar service — every deployment manifest, this new one included, is plain, applied-
as-is Kubernetes YAML (`kubectl apply -f`), picked up automatically by `integration/scripts/
deploy.sh`'s existing `manifests/1[0-7]-*.yaml` glob, no script changes needed. Reuses keep's own
image, `serviceAccountName: keep`, and signet identity — unlike the RabbitMQ credential
provisioner (which needs a separate narrow ServiceAccount with Kubernetes RBAC to create Secrets/
CRDs directly), this job never touches the Kubernetes API, only signet/Postgres/Stripe, so
keep's existing RBAC already covers it. The container `command` overrides the image's default
`CMD ["node", "dist/server.js"]` to run `dist/sync-pricing.js` instead — no Dockerfile change,
no second image. `restartPolicy: OnFailure` carries the exact same reasoning (and is corrected
directly from) kluster's own CronJob: SPIRE registers a Pod's SPIFFE identity per-Pod, and a
`restartPolicy: Never` retry would get a brand-new Pod that re-hits the same fresh-registration
race every time; `OnFailure` retries in place, inside the already-registered Pod. **Schedule is
a plain hardcoded `"0 4 * * *"`/`"America/New_York"`** (one hour after the RabbitMQ rotation
job's own 3 AM slot, avoiding — not because it's load-bearing — the two jobs contending for
resources at the same instant) — not exposed as configuration, matching every other manifest in
that directory. **Not live-validated against a real cluster in this pass**, same scope note as
every other manifest/entrypoint in this design; `kubectl apply --dry-run=client` confirms it's
schema-valid.

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

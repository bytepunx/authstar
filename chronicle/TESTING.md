# Testing Conventions

Three tiers, run separately (`npm run test:behavior` / `test:e2e` / `test:integration`), or
together (`test`/`test:all`). All three build `src/` to `dist/` first (`pretest`/
`pretest:integration`) -- kept consistent with tower's own convention even though chronicle's
own consumer/routes don't have an equivalent of `consequent`'s compiled-actor-loading
requirement; running every tier against the same compiled artifact the real server loads is
still the right default.

## `spec/behavior/*.spec.ts` -- consumer logic and API contract

- **Consumer** (`consumer.spec.ts`): the channel-agnostic core of Story 001
  (`src/consumer/message-handler.ts`) tested against a fake broker channel/message
  (`spec/lib/fake-channel.ts`) and the in-memory `ClickHouseApi` fake
  (`spec/lib/in-memory-clickhouse.ts`) -- asserting mapping correctness, batching, and
  ack/nack decisions. No real amqplib connection or ClickHouse involved; the real broker
  wiring (`src/consumer/build-consumer.ts`) is deliberately kept thin and delegates
  everything testable to this handler.
- **Reporting routes** (`auth-funnel.spec.ts`, `active-users.spec.ts`, `query.spec.ts`,
  `export-summary.spec.ts`): `fastify.inject()` against a real fastify instance built with
  `buildApp()`, backed by the in-memory `ClickHouseApi` fake -- real query *semantics*
  (filtering/grouping/aggregation), not mocked responses, mirroring tower's own
  in-memory-`consequent` philosophy. One file per route, asserting request/response shapes,
  status codes, and Story 002's specific acceptance criteria (the invite-redemption
  limitation, tenant-wide vs. per-application active-user dedup, the `groupBy`/`filters`
  vocabulary's `400` on anything outside it).
- Auth is exercised for real, not bypassed: `spec/lib/jwt.ts` signs an actual HS256 JWT with
  the same secret the test `ChronicleConfig` uses, so every behavior test that hits a route
  goes through `requirePermission`'s real signature verification.

## `spec/e2e/*.spec.ts` -- full flows, still no external dependencies

- `spec/e2e/ingest-then-report.spec.ts`: events flow through the same message handler used by
  the behavior tier, into the same in-memory `ClickHouseApi` fake, then back out through the
  real fastify routes over HTTP -- the full ingestion-to-reporting round trip a real
  deployment exercises, not any one call's contract in isolation. Still entirely fake-backed;
  no broker, no ClickHouse.

## `spec/integration/*.integration.spec.ts` -- real dependencies, this service only

- **`clickhouse.integration.spec.ts`**: `RealClickHouseClient` (`src/lib/clickhouse-client.ts`)
  against a real, disposable ClickHouse instance via `testcontainers`. There is no official
  `@testcontainers/clickhouse` package, so this uses the generic `GenericContainer` API
  directly against `clickhouse/clickhouse-server:latest`, waiting on the HTTP port's own
  `/ping` endpoint (`Wait.forHttp('/ping', 8123)`).
- **`rabbitmq.integration.spec.ts`**: the real amqplib wiring (`src/consumer/build-consumer.ts`)
  against a real, disposable RabbitMQ broker via `@testcontainers/rabbitmq`. Deliberately still
  uses the in-memory `ClickHouseApi` fake -- this suite's job is proving the exchange/queue/
  binding topology and message flow are wired correctly, isolated from ClickHouse (which has
  its own suite); combining both real dependencies in one test would blur which dependency a
  failure actually points at.
- Both are scoped to this one service and its own direct dependency. No other authstar service
  is ever called here -- multi-service integration is a separate, later project.
- **Close chronicle's own client/consumer before stopping the container**, not after -- same
  ordering tower's own integration tier settled on for Postgres: stopping the container first
  leaves an open client connection with nowhere to go.
- Needs Docker running locally / in CI. `beforeAll`'s own timeout is generous (90-120s) --
  container pull + start can genuinely take a while on a cold image cache, and the ClickHouse
  image in particular is large.

## Real bugs this pass found -- worth knowing before touching ClickHouse code here

1. **Fastify's default AJV options set `removeAdditional: true`** -- same bug the tower pilot
   found, applies identically here. `buildApp()` overrides it globally
   (`ajv: { customOptions: { removeAdditional: false } }`) so the constrained query endpoint's
   `groupBy`/`filters` vocabulary (Story 002 / ADR 0036) actually rejects an out-of-vocabulary
   field instead of silently stripping it -- load-bearing for that endpoint's entire safety
   argument, not just a nicety.
2. **ClickHouse's `DateTime64` *query-parameter* binding rejects RFC 3339 strings.** Sending
   `2026-08-01T00:00:00Z` as a `{from:DateTime64(3)}`-typed bound parameter 400s with
   `"isn't parsed completely: only 19 of 20 bytes was parsed"` -- the `T` separator and
   trailing `Z` aren't accepted there, even though the *same* format is accepted fine when
   inserting via `JSONEachRow` (confirmed by actually running both paths against a real
   instance, not assumed from docs). Every ISO date range accepted over HTTP is normalized
   through `toClickHouseDateTime()` (`src/lib/clickhouse-client.ts`) into ClickHouse's own
   native `YYYY-MM-DD HH:MM:SS.sss` text format before being bound as a query parameter.
3. **The `clickhouse/clickhouse-server` image generates a random `default`-user password on
   first boot unless setup is explicitly skipped.** Without
   `CLICKHOUSE_SKIP_USER_SETUP: '1'` in the container's environment, every insert/query call
   from the integration suite 401s with "Authentication failed" -- found by actually running
   the suite, not documented anywhere obvious in the client library's own errors.
4. **`system.tables.engine_full` canonicalizes the `TTL` clause's syntax.** A DDL written as
   `TTL timestamp + INTERVAL 24 MONTH` comes back from `system.tables` as
   `timestamp + toIntervalMonth(24)` -- semantically identical, textually different. A test
   asserting on the raw DDL string needs to check for the canonicalized form, not the
   `INTERVAL`-keyword form this service happens to send.

None of the three `consequent`-specific bugs the tower pilot found apply here -- chronicle has
no `consequent`, by design (ADR 0035: "write what arrived, make it queryable," no business
invariants to enforce).

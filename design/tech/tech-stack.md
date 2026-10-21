# Tech Stack Reference

Concrete library/framework choices for implementing authstar's services, one level more
specific than `claude.md`'s high-level "fastify + consequent" summary. Stories describe
behavior and contracts, not library names — this doc is where the actual package choices live,
so stories can reference it instead of repeating "using library X" in every one of them.

Grounded against the real, currently-maintained libraries this depends on (checked directly,
not assumed): `consequent` v2, `consequent-postgres` v2, `fount`, `node-flakes` (all
`github.com/arobson/*`), and `@bytepunx/signet-client` (Rust and TypeScript, both real,
published, and already implement everything ADR 0004/0011/0021/0045 assume signet access looks
like).

## Cross-cutting

- **Secrets/config**: every service reaches signet via `@bytepunx/signet-client` — Rust
  (`signet-client` crate) for portcullis, TypeScript (`@bytepunx/signet-client` npm package)
  for every Node service. Both expose `dialAdmin`/`dial_admin` (bearer-token operator access)
  and `dialWorkload`/`dial_workload` (SPIFFE mTLS workload access) — the exact two access
  patterns ADR 0021/0030 already established as tower's/keep's/herald's two auth models. No
  service hand-rolls its own signet or SPIFFE integration.
- **RabbitMQ**: Node services use `amqplib` (the standard AMQP 0-9-1 client) wrapped in
  `amqp-connection-manager` for automatic reconnect — consistent with how much of this design
  already treats connection resilience as a first-class concern (retry logic, idempotency keys
  throughout). Portcullis uses `lapin`, the standard async, tokio-native AMQP client for Rust.
- **Consequent has no message-bus adapter in v2** (confirmed directly — its `CLAUDE.md`'s
  initialization example lists only `actorStore`/`eventStore`/`actorCache`/`eventCache`/
  `searchAdapter`, no `messageBus`). Publishing to RabbitMQ is **application code, not
  consequent's job**: a service calls `system.handle(...)`, gets back the array of events that
  actually occurred, and *then* — outside consequent, after the command durably succeeded —
  decides which of those events to also publish. This is a deliberate two-step "store, then
  publish" shape, not an oversight; it's also exactly consistent with consequent's own stated
  constraint that event handlers must be pure with no side effects, so publishing could never
  have lived inside the event-handler layer to begin with. No outbox-pattern is designed here —
  best-effort publish-after-store is judged sufficient given every consumer downstream is
  already built for eventual consistency and idempotent redelivery (erasure fan-out,
  entitlement events' current-value-replace shape, `Idempotency-Key` throughout).

## portcullis (Rust)

Per `claude.md`, follows the Rust reference implementation (`ref-proxy`) — its actual
`Cargo.toml` choices carry forward as settled, not re-litigated:

- **Runtime**: tokio (`full` features)
- **HTTP framework**: axum 0.7, `axum-extra` (cookies), `tower`/`tower-http`
- **JWT**: `jsonwebtoken` 9 — already supports the ES256 + `kid`-selection model this design
  depends on throughout (ADR 0028/0080/0081)
- **HTTP client**: `reqwest`
- **Logging/tracing**: `tracing` + `tracing-subscriber`

What `ref-proxy` doesn't have, that real portcullis needs (the genuine gap this doc closes):

- **Signet/config**: `signet-client` crate, `spiffe-workload` feature enabled — gives
  `dial_admin` and `dial_workload` directly; no custom gRPC/mTLS code needed. Replaces
  `ref-proxy`'s plain `serde_yaml`+`dotenvy` config loading entirely — the bundle comes from
  signet, not a local file, per every ADR since 0004.
- **SPIFFE mTLS** (portcullis→tower/keep/lookout/web calls): comes bundled with
  `signet-client`'s `spiffe-workload` feature (`spiffe`/`spiffe-rustls` crates) — no separate
  SPIFFE dependency to add.
- **RabbitMQ** (portcullis→lookout analytics dispatch): `lapin`.
- No database driver needed — portcullis is stateless by design (ADR 0002), the signet bundle
  lives in memory only.

## tower, keep, herald (Node — event-sourced services)

- **Language**: TypeScript, ESM. Node `>=22` (matches `consequent`'s own engine requirement,
  the stricter of `consequent`'s and `consequent-postgres`'s).
- **HTTP framework**: fastify, per ADR 0030/0034/0041 — schema-first routes, `@fastify/swagger`
  (or equivalent) generating the OpenAPI document `web` consumes, request validation free from
  the same JSON schemas (fastify's built-in `ajv`, no separate validation library needed).
- **Domain model / persistence**: `consequent` (actor/event-sourcing core) +
  `consequent-postgres` (storage adapters — actor snapshots, event log, JSONB search index,
  auto-created per-type tables) + `fount` (DI, consequent's own dependency injection) +
  `node-flakes` (flake-based ID generation — this is what "business key: a generated id
  (flake-based)" throughout the ADRs, e.g. ADR 0067, has actually meant all along).
  **No separate ORM or query builder** — `consequent-postgres` owns all Postgres access for
  every event-sourced actor in this design; nothing here needs raw SQL.
- **JWT** (internal-JWT verification where a Node service independently re-verifies the
  portcullis-forwarded token, per ADR 0030's "defense in depth" pattern): `jose` — modern,
  ESM-native, strong native `kid`/JWKS-set support, a better fit than `jsonwebtoken` for a
  design that verifies against a resolved key selected by `kid` everywhere.
- **Templating** (herald only, ADR 0078): `mustache.js` — the reference Mustache
  implementation, logic-less by construction, the direct library-level match for "logic-less
  mustache-style substitution, no embedded logic" as designed.
- **Testing**: `vitest` — matches `consequent`'s and `consequent-postgres`'s own choice
  directly (both use it), not a separate convention introduced for authstar's own services.

## lookout (Node — stateless ingestion)

- TypeScript, ESM, fastify (lightweight — no consequent, no database, per `claude.md`).
- `amqplib`/`amqp-connection-manager` for publishing onto RabbitMQ — its only real job.
- `vitest`.

## chronicle (Node — analytics storage/reporting)

- TypeScript, ESM. No consequent (per `claude.md` — analytics data isn't event-sourced business
  state, it's a stream written straight through).
- **ClickHouse client**: `@clickhouse/client` — the official Node.js client.
- `amqplib`/`amqp-connection-manager` for consuming off RabbitMQ.
- Whatever HTTP framework serves its reporting API (ADR 0036) — fastify, for consistency with
  every other Node HTTP service in this design, even though chronicle itself isn't
  consequent-backed.
- `vitest`.

## web, steward (SvelteKit)

- **Svelte 5** (runes) + **SvelteKit 2** — current, stable.
- TypeScript throughout.
- **Testing**: `vitest` for unit tests, Playwright for end-to-end — the standard modern
  SvelteKit pairing.
- **Styling (the admin apps themselves)**: Tailwind CSS — fast iteration for admin/operator
  screens with no stated design-system requirement of their own. **This is unrelated to, and
  doesn't change,** the embeddable Web Component widgets' theming mechanism (ADR 0044/0072),
  which stays plain CSS custom properties by design — those ship into arbitrary host pages and
  can't assume Tailwind (or any build step) is present there. Two different styling stories for
  two genuinely different distribution targets, not an inconsistency.
- **The Web Component widget package** (ADR 0072's six custom elements) is a separate build
  target from the SvelteKit admin app — framework-agnostic output, most naturally Vite's
  library mode, living in the same `web` repo but publishing/bundling independently, since
  adopting applications need to drop in a small, dependency-free script tag, not a SvelteKit
  runtime.
- `steward` shares the same stack as `web` (SvelteKit 2/Svelte 5/TypeScript/vitest/Playwright)
  but has no Web Component package of its own and, per ADR 0044/0048, no Tailwind requirement
  beyond whatever's simplest for its deliberately small, unbranded screen set.

## Not decided here

- CI/deployment tooling, Dockerfile conventions, and per-repo GitHub Actions setup — a separate
  concern from library/framework choices, not covered by this doc.
- `docs/provider-examples.md`, referenced by Story 004 as "carried over from `ref-design`," has
  never actually been created in this repo — a small, separate gap, not a tech-stack question.

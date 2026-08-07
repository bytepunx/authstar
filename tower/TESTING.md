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

## Three real bugs this pilot found — worth knowing before writing more services' tests

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

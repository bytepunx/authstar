# Testing Conventions

Three tiers, run separately (`npm run test:behavior` / `test:e2e` / `test:integration`), or
together (`npm run test:all`). Behavior and e2e both build `src/` to `dist/` first (`pretest`)
for parity with the integration tier and the real server entrypoint, even though neither tier
actually loads compiled output directly the way `consequent`'s actor loader forced tower to care
about -- lookout has no such loader, but running everything against a build that actually
compiles is still the point of `pretest`, not an artifact of copying tower's setup.

Lookout has exactly one real dependency -- RabbitMQ -- and no database, no `consequent`. The
seam that makes all three tiers possible is `Publisher` (`src/lib/publisher.ts`): a one-method
interface (`publish(routingKey, message)`) that `buildApp()` takes as a required option. Behavior
and e2e tests hand it a fake (`spec/lib/fake-publisher.ts`) that just records calls in memory;
only the integration tier hands it the real `amqplib`-backed implementation
(`src/lib/amqp-publisher.ts`).

## `spec/behavior/*.spec.ts` -- API contract

- `fastify.inject()` against a real fastify instance -- no real network, no real broker.
- Backed by the fake `Publisher` -- asserts the actual message that *would* have been published
  (routing key, shape, generated `eventId`), not just the HTTP response.
- One file per route group (currently just `events.spec.ts`, since Story 001 is lookout's only
  route), asserting exactly what's in the Story's acceptance criteria: request/response shapes,
  status codes, and the specific rules (the client-only allowlist/size-cap/rate-limit trio, the
  unconditional no-IP rule, the AJV `removeAdditional` fix).

## `spec/e2e/*.spec.ts` -- full flows, still no external dependencies

- Same fake `Publisher` as the behavior tier, but exercises a realistic *sequence* of calls
  through the HTTP surface -- a burst of mixed valid/invalid traffic the way portcullis would
  actually fire it, or a full auth-funnel sequence (failed login -> succeeded login -> signup)
  followed by a client-side page-view forwarded with server-attached identity -- not one call's
  contract in isolation.
- Lookout has no setup step that needs bypassing the HTTP layer (no tenant/account to seed --
  the whole point of this service is that it's stateless), so unlike tower's e2e tier this one
  never needs to reach past `app.inject()` for anything.

## `spec/integration/*.integration.spec.ts` -- real RabbitMQ, this service only

- Real RabbitMQ via `testcontainers` (`@testcontainers/rabbitmq`), the real `amqplib`-backed
  `Publisher` (`src/lib/amqp-publisher.ts`) -- proves the actual publish call lands a real
  message on a real queue bound to the real exchange, not just that the fake recorded a call.
- A second, independent `amqplib` connection stands in for chronicle's real consumer: it binds
  queues to the same non-durable `analytics` topic exchange lookout publishes to and asserts
  messages actually arrive with the right routing key and shape.
- Scoped to this one service and its own direct dependency. No other authstar service is ever
  called here -- multi-service integration is explicitly a separate, later project.
- **Close the publisher's channel/connection before stopping the container**, not after --
  mirrors tower's own `consequent-postgres`-adapter-before-`container.stop()` convention.
  Stopping the container first leaves an open client connection with nowhere to go and surfaces
  as a noisy uncaught exception even though the tests themselves already passed.
- Needs Docker running locally / in CI. `beforeAll`'s own timeout is generous (60s+) -- container
  pull + start can genuinely take a while on a cold image cache.

## Gotchas worth knowing before writing more services' tests

1. **Fastify's default AJV options set `removeAdditional: true`** -- an `additionalProperties:
   false` schema silently *strips* an unknown field instead of rejecting the request, even
   though that's not fastify's advertised default behavior in casual reading of its docs. Every
   `buildApp()` call in this codebase overrides this (`ajv: { customOptions: { removeAdditional:
   false } }`) so a schema that says "reject unknown fields" actually does -- load-bearing here
   specifically, since an ingestion contract needs to *reject* a client-asserted `ip` field
   (ADR 0035's unconditional no-IP rule), not silently drop it and publish the rest.
2. **`RateLimiter` is deliberately process-local, not shared.** Lookout is stateless and has no
   database (Story 001) -- the in-memory fixed-window limiter (`src/lib/rate-limiter.ts`) resets
   per replica, per process restart. That's an accepted limitation for this story, not an
   oversight; a shared limiter is future work only if per-replica drift ever actually matters at
   the volumes this service sees.
3. **`@testcontainers/rabbitmq`'s `StartedRabbitMQContainer` only exposes `getAmqpUrl()` /
   `getAmqpsUrl()`** -- no built-in helper for asserting exchange/queue state, unlike some other
   testcontainers modules' richer clients. The integration tests open their own plain `amqplib`
   connection as a stand-in consumer for exactly this reason.

---
id: T-0036
type: task
nature: remediation
title: Chronicle's integration tier and TESTING.md mint ES256 test tokens
status: backlog
parent: S-0009
owner: bytepunx
created: 2026-11-06T17:50:44Z
updated: 2026-11-06T17:50:44Z
transitions: []
stream: S-0009
tags: [chronicle, testing]
touches: [chronicle/spec/integration/clickhouse.integration.spec.ts, chronicle/spec/integration/rabbitmq.integration.spec.ts, chronicle/TESTING.md]
after: [T-0034]
---
# T-0036 Chronicle's integration tier and TESTING.md mint ES256 test tokens

## Work

Move chronicle's integration tier onto the ES256 fixture T-0034 writes in `chronicle/spec/lib/jwt.ts`:

- Update `spec/integration/clickhouse.integration.spec.ts`, and `rabbitmq.integration.spec.ts` if it builds an app with config, so they no longer pass `internalJwtSecret` or sign HS256.
- Rewrite the `chronicle/TESTING.md` passage that says `spec/lib/jwt.ts` signs an HS256 JWT. It should describe the ES256 fixture and the injected `staticKeyProvider`.

## Done when

- `npm run test:integration` in `chronicle/` passes against real ClickHouse and RabbitMQ, or, where this environment cannot start them, `npm run typecheck` passes and the narrative says the integration run is still owed.
- `grep -rn "HS256\|internalJwtSecret" chronicle/spec chronicle/TESTING.md` finds nothing but a test that asserts HS256 is refused.

## Notes

The integration specs need ClickHouse and RabbitMQ. See `chronicle/TESTING.md` for how they are started.

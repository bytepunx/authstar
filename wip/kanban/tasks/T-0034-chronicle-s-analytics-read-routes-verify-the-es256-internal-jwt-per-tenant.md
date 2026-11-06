---
id: T-0034
type: task
nature: remediation
title: "Chronicle's analytics:read routes verify the ES256 internal JWT per tenant through authstar-fastify"
status: in-progress
parent: S-0009
owner: bytepunx
created: 2026-11-06T17:50:10Z
updated: 2026-11-06T17:54:33Z
transitions:
  - to: ready
    at: 2026-11-06T17:54:33Z
    by: agent-S-0009
  - to: in-progress
    at: 2026-11-06T17:54:33Z
    by: agent-S-0009
stream: S-0009
tags: [chronicle, auth]
touches: [chronicle/package.json, chronicle/package-lock.json, chronicle/src/lib/auth.ts, chronicle/src/lib/config.ts, chronicle/src/lib/signet-bundle-config.ts, chronicle/src/lib/build-app.ts, chronicle/src/lib/fastify-augment.d.ts, chronicle/src/server.ts, chronicle/src/routes/auth-funnel.ts, chronicle/src/routes/active-users.ts, chronicle/src/routes/query.ts, chronicle/src/routes/export-summary.ts, chronicle/spec/lib/jwt.ts, chronicle/spec/lib/test-config.ts, chronicle/spec/behavior/auth-funnel.spec.ts, chronicle/spec/behavior/active-users.spec.ts, chronicle/spec/behavior/query.spec.ts, chronicle/spec/behavior/export-summary.spec.ts, chronicle/spec/behavior/config.spec.ts, chronicle/spec/behavior/signet-bundle-config.spec.ts, chronicle/spec/e2e/ingest-then-report.spec.ts, design/tech/tech-stack.md]
---
# T-0034 Chronicle's analytics:read routes verify the ES256 internal JWT per tenant through authstar-fastify

## Work

Replace chronicle's HS256 shared-secret check with the ES256 per-tenant verification herald already uses. Copy herald's pattern from `herald/src/lib/build-app.ts` and `herald/src/server.ts`, which follows ADR-0086, ADR-0089, and ADR-0091:

- Add `@bytepunx/authstar-fastify` to `chronicle/package.json`, pinned the way herald pins it.
- Register `authstarFastifyPlugin` in `chronicle/src/lib/build-app.ts`. It uses `perTenantJwksKeyProvider` with a `resolveTenantDomain` that asks tower over HTTP. Add `authstarGetKey` and `resolveTenantDomain` to `BuildAppOptions` so tests can inject `staticKeyProvider`.
- Add `towerBaseUrl` to `ChronicleConfig`: from the signet bundle in `signet-bundle-config.ts`, and from an env variable in `config.ts`. Name the env variable after herald's or keep's equivalent.
- Remove `internalJwtSecret`, `CHRONICLE_INTERNAL_JWT_SECRET`, and `DEV_ONLY_INTERNAL_JWT_SECRET` from `config.ts` and `signet-bundle-config.ts`.
- Rewrite `requirePermission` in `chronicle/src/lib/auth.ts` to read the verified claims, as herald's `permissions.ts` does. Update the four routes to call it without a secret.
- Replace the HS256 helper in `chronicle/spec/lib/jwt.ts` with an ES256 fixture like `herald/spec/lib/internal-jwt.ts`: a keypair, a `staticKeyProvider`, and the header `{alg: ES256, kid, tenant}`.
- Update `test-config.ts`, the behavior specs, and the e2e spec `spec/e2e/ingest-then-report.spec.ts` to use the fixture.
- Record the new dependency in the chronicle section of `design/tech/tech-stack.md`, with its version, its use, and the alternative considered: calling `verifyInternalJwt` from authstar-core directly.

## Done when

- In `chronicle/`, `npm test` (behavior and e2e) and `npm run typecheck` pass.
- Behavior tests show that each `analytics:read` route:
  - returns 200 for an ES256 token carrying `analytics:read`;
  - returns 401 for a missing token, a token signed by an unknown key, and an HS256 token;
  - returns 403 for a valid token without `analytics:read`, and for a token whose `tenant` header is not the path's tenant.
- `grep -rn "internalJwtSecret\|CHRONICLE_INTERNAL_JWT_SECRET\|dev-only-insecure-secret" chronicle/src chronicle/spec/behavior chronicle/spec/e2e chronicle/spec/lib` finds nothing.
- Config tests cover `towerBaseUrl` from env and from the bundle. A bundle without it fails loud, as herald's does.

## Notes

Keep chronicle's 401/403 split: 401 means the token is missing or does not verify, and 403 means the token is valid but lacks the permission or names another tenant. Tower is not the model here: it resolves domains from its own store. Chronicle has no lint script; `npm run typecheck` is its static check.

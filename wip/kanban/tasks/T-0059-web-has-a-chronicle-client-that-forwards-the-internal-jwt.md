---
id: T-0059
type: task
nature: feature
title: Web has a chronicle client that forwards the internal JWT
status: backlog
parent: S-0012
owner: bytepunx
created: 2026-11-06T18:09:38Z
updated: 2026-11-06T18:09:48Z
transitions: []
stream: S-0012
tags: [web]
touches: [web/src/lib/server/clients/chronicle.ts, web/src/lib/server/config.ts, web/src/hooks.server.ts, web/src/app.d.ts, web/spec/fixtures/fake-chronicle-client.ts, web/spec/fixtures/fake-chronicle-server.ts, web/spec/integration/chronicle.integration.spec.ts, web/spec/behavior/config.spec.ts, integration/config/authstar/web.yaml, integration/manifests/16-web.yaml, docs/operators/index.md]
---
# T-0059 Web has a chronicle client that forwards the internal JWT

## Work

- Add `web/src/lib/server/clients/chronicle.ts`, shaped like `tower.ts` and `keep.ts`: `createChronicleClient({ baseUrl, authorization, fetch })`.
  - `getActiveUsers` calls `GET /tenants/{tenantSlug}/analytics/reports/active-users` with `from`, `to`, `granularity`, and an optional `application`.
  - `getAuthFunnel` calls `GET /tenants/{tenantSlug}/analytics/reports/auth-funnel` with `from`, `to`, and an optional `application`.
  - Type each response after the shape `chronicle/src/routes/active-users.ts` and `auth-funnel.ts` return, and export the types from the client. Chronicle's files do not change.
  - The Overview tile and the Analytics page share the active-users call through this one method, as ADR-0059 asks.
- Add `chronicleBaseUrl` to `WebConfig` in `web/src/lib/server/config.ts`.
  - In env mode, read `CHRONICLE_BASE_URL`, defaulting to `http://chronicle.internal:3000` like tower and keep.
  - In signet mode, read it from the bundle.
- In `web/src/hooks.server.ts`, build the client with the same forwarded bearer token as tower and keep, and set `event.locals.clients.chronicle`. Type it in `web/src/app.d.ts`.
- Add a `vi.fn`-based fake, `web/spec/fixtures/fake-chronicle-client.ts`, and a `node:http` fake server, `web/spec/fixtures/fake-chronicle-server.ts`, after the tower ones.
- Give the harness's web the chronicle URL in `integration/config/authstar/web.yaml` and `integration/manifests/16-web.yaml`.
- List the new setting in `docs/operators/index.md`.

## Done when

- [ ] `web/spec/integration/chronicle.integration.spec.ts` shows each method sends `Authorization: Bearer <the session's internal JWT>` and parses the fake server's report.
- [ ] `web/spec/behavior/config.spec.ts` covers `chronicleBaseUrl` in env mode and in signet mode.
- [ ] The tests pass through `flai test` once web's tiers are wired (I-0003), or else with `npm run test:behavior` and `npm run test:integration` in `web`. `npm run check` in `web` is clean.
- [ ] `docs/operators/index.md` names the setting, its environment variable, its bundle key, and its default.

## Notes

The client calls chronicle directly over HTTP, as web calls tower and keep. Chronicle verifies the token only once S-0009 lands, which is why the story waits for S-0009.

---
id: T-0031
type: task
nature: remediation
title: Embed loads and actions turn tower and keep failures into a handled error
status: backlog
parent: S-0011
owner: bytepunx
created: 2026-11-06T17:49:27Z
updated: 2026-11-06T17:52:00Z
transitions: []
stream: S-0011
tags: [web]
touches: ["web/src/routes/(embed)/applications/[applicationSlug]/api-keys/+page.server.ts", "web/src/routes/(embed)/organizations/[organizationId]/+page.server.ts", "web/src/routes/(embed)/organizations/[organizationId]/applications/[applicationSlug]/api-keys/+page.server.ts", web/spec/behavior/embed-application-api-keys.spec.ts, web/spec/behavior/embed-organization.spec.ts, web/spec/behavior/embed-organization-api-keys.spec.ts]
after: [T-0029]
---
# T-0031 Embed loads and actions turn tower and keep failures into a handled error

## Work

- Apply `web/src/lib/server/upstream-error.ts` from T-0029 to the `(embed)` loads and actions that call tower or keep:
  - `applications/[applicationSlug]/api-keys`: its load calls `getAccount` and `listPersonalApiKeys` with no handling.
  - `organizations/[organizationId]` and `organizations/[organizationId]/applications/[applicationSlug]/api-keys`: their try/catch blocks re-throw everything but NotFound.
- Leave the `error(403)` the `(embed)` layouts throw alone. Leave `(hosted)/oauth2/select`, which handles its own failure, alone too.
- In each page's existing spec, add a case where the fake client throws a 500. The load throws an `HttpError` with status 502, and an action returns `fail(502)`.

## Done when

- [ ] No `(embed)` load or action lets a tower or keep request error reach SvelteKit's default 500 handler.
- [ ] The changed behavior tests pass, through `flai test` once the test tiers are wired (I-0003), or else with `npm run test:behavior` in `web`.

## Notes

This task waits for T-0029, which writes the helper.

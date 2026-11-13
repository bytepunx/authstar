---
id: T-0048
type: task
nature: feature
title: "Lookout validates server-side auth.* events against ADR-0058"
status: done
parent: S-0010
owner: bytepunx
created: 2026-11-06T18:08:23Z
updated: 2026-11-10T05:14:27Z
transitions:
  - to: ready
    at: 2026-11-10T04:57:32Z
    by: agent-S-0010
  - to: in-progress
    at: 2026-11-10T04:57:32Z
    by: agent-S-0010
  - to: done
    at: 2026-11-10T05:14:27Z
    by: agent-S-0010
stream: S-0010
tags: [lookout]
touches: [lookout/src/lib/event-types.ts, lookout/src/routes/events.ts, lookout/src/lib/build-app.ts, lookout/spec/behavior/events.spec.ts, lookout/spec/e2e/ingestion-flows.spec.ts, lookout/spec/integration/events.integration.spec.ts, lookout/TESTING.md, design/stories/lookout/001-ingestion-contract.md]
usage:
  source: log
  seconds: 1015
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 37
      output: 13636
      cache_read: 2719148
      cache_write: 177927
      cost: 1.8078
---
# T-0048 Lookout validates server-side auth.* events against ADR-0058

## Work

- In `lookout/src/lib/event-types.ts`, add a server-side allowlist beside the client one: `auth.login-succeeded`, `auth.login-failed`, `auth.logout`, `auth.invite-redeemed`, and `auth.signup-completed`, the names chronicle already reads in `chronicle/src/lib/types.ts`.
- In `lookout/src/routes/events.ts`, the server-side branch skips validation today. Reject an `auth.*` type outside the allowlist with `400`. Require `idp` on `login-succeeded` and `login-failed`. Accept `reason` only on `login-failed`, and only one of ADR-0058's five categories: `state_mismatch`, `pkce_missing`, `token_exchange_failed`, `userinfo_failed`, `incomplete_profile`. Keep the client path as it is.
- In `lookout/src/lib/build-app.ts`, take an override for the server-side allowlist the way `clientEventAllowlist` is taken, so tests can set it.
- Add behavior cases in `lookout/spec/behavior/events.spec.ts`: an unknown `auth.*` type, a missing `idp`, a `reason` on a type other than `login-failed`, and an unknown `reason`. Extend the auth cases in `spec/e2e/ingestion-flows.spec.ts` and `spec/integration/events.integration.spec.ts` to publish each allowed type.
- Update `lookout/TESTING.md` if what a tier covers changes, and the server-side validation bullet of `design/stories/lookout/001-ingestion-contract.md`, which says server events get no allowlist check.

No `after`: this task reads nothing the portcullis tasks write, so it runs beside the portcullis emitter task.

## Done when

- Lookout answers `400` to an `auth.*` event outside the allowlist or breaking ADR-0058's field rules, and publishes each allowed type.
- The behavior, e2e, and integration specs cover each rule, and `flai test` on lookout's paths passes.
- `flai check --strict` and the markdown lint pass.

## Notes

Lookout's schema pattern already lets `auth.*` through, and its `reason` enum already holds the five categories, on any type. This task narrows it to ADR-0058's rules. ADR-0058 is accepted: do not edit it.

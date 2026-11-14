---
id: T-0140
type: task
nature: remediation
title: Portcullis sends the login's email to tower's /identities/resolve, so a new account's contact is the invite's
status: done
parent: S-0017
owner: bytepunx
created: 2026-11-14T08:27:17Z
updated: 2026-11-14T08:34:36Z
transitions:
  - to: ready
    at: 2026-11-14T08:27:28Z
    by: agent-S-0017
  - to: in-progress
    at: 2026-11-14T08:27:28Z
    by: agent-S-0017
  - to: done
    at: 2026-11-14T08:34:36Z
    by: agent-S-0017
stream: S-0017
tags: []
touches: [portcullis/crates/authstar-middleware/src/identities.rs, portcullis/crates/authstar-middleware/src/oauth/callback.rs, portcullis/crates/authstar-middleware/tests/integration_tests.rs, design/stories/proxy/006-oauth2-callback.md]
usage:
  source: log
  seconds: 428
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 23
      output: 7095
      cache_read: 3643572
      cache_write: 61531
      cost: 1.2782
---
# T-0140 Portcullis sends the login's email to tower's /identities/resolve, so a new account's contact is the invite's

## Work

Criterion 4, as the operator chose on TH-0048 (option 1).

Live on s-0017 at b630f32, the report through portcullis answered `403 missing required permission: analytics:read`. Portcullis's `ResolveRequestBody` carries no `email`, though tower story 003 and `tower/src/routes/identities.ts` take one. Tower made the new account's contact with an empty email, so `redeemInvite`, which needs the account's contact to be the invite's, never redeemed the first-admin invite.

- `identities.rs`: `ResolveRequestBody` gains `email`; `resolve_identity` takes it.
- `oauth/callback.rs`: passes the userinfo email.
- `tests/integration_tests.rs`: the callback's resolve request carries the userinfo email, a test that fails without the change.
- `design/stories/proxy/006-oauth2-callback.md`: the resolve step names the email it sends.

## Done when

- `flai test` on the paths passes, and the new assertion fails on `main`'s portcullis.
- After a teardown and redeploy of s-0017, the in-namespace driver reads the report through portcullis with 200.

## Notes

---
id: T-0050
type: task
nature: feature
title: Portcullis's callback and logout dispatch the auth-funnel events
status: done
parent: S-0010
owner: bytepunx
created: 2026-11-06T18:08:55Z
updated: 2026-11-10T05:51:21Z
transitions:
  - to: ready
    at: 2026-11-10T05:24:24Z
    by: agent-S-0010
  - to: in-progress
    at: 2026-11-10T05:24:25Z
    by: agent-S-0010
  - to: done
    at: 2026-11-10T05:51:21Z
    by: agent-S-0010
stream: S-0010
tags: [portcullis, rust]
touches: [portcullis/crates/authstar-middleware/src/oauth/callback.rs, portcullis/crates/authstar-middleware/src/oauth/logout.rs, portcullis/crates/authstar-middleware/tests/integration_tests.rs, portcullis/TESTING.md, portcullis/README.md, design/stories/proxy/020-analytics-event-ingestion.md, design/stories/proxy/006-oauth2-callback.md]
after: [T-0049]
usage:
  source: log
  seconds: 1616
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 58
      output: 21748
      cache_read: 4336687
      cache_write: 283770
      cost: 2.8832
---
# T-0050 Portcullis's callback and logout dispatch the auth-funnel events

## Work

- In `oauth/callback.rs`, dispatch through T-0049's emitter, never awaited:
  - `auth.login-succeeded` with `idp` and `identityHash` once the session is issued.
  - `auth.signup-completed` when tower's login-time resolution answers `isNewAccount: true`, replacing the deferred log line there. `identities.rs` already parses the field. `isNewAccount` goes on no token.
  - `auth.login-failed` with `idp` and a `reason` from ADR-0058's five categories on each failure Story 006's error table names. A failure outside the table, such as a missing identity-hash key, a failed resolution, or a session that cannot be signed, is a server fault: map it to a category only where one fits, such as a missing `code` to `token_exchange_failed`, and emit nothing otherwise. Record the mapping in the narrative's `## Decisions`. Never send the raw provider error.
- In `oauth/logout.rs`, dispatch `auth.logout`. Logout reads only the cookie, so `identityHash` is left out when no session verifies.
- Add wiremock tests in `authstar-middleware/tests/integration_tests.rs` for each event: its type and fields, a failure for each reason category, a returning login that sends no `signup-completed`, and a callback that answers the same with lookout down.
- Update `portcullis/TESTING.md` and `portcullis/README.md`, which mark Story 020 and the signup dispatch as deferred. In `design/stories/proxy/020-analytics-event-ingestion.md`, correct the claim that `signup-completed` fires from Story 010: ADR-0058 moved it to the callback. Check `006-oauth2-callback.md`'s signup paragraph against what was built.

Waits for T-0049, whose emitter and state field this task calls.

## Done when

- A login, a failed login, a first login, and a logout each post the event above to a wiremock lookout, and the response is the same with lookout down.
- `flai test` on portcullis's paths passes, and `flai check --strict` and the markdown lint pass.

## Notes

No `auth.login-attempted` type is added: ADR-0058 defines none, and attempts are succeeded plus failed. `invite-redeemed`, `analytics.request`, the client route, and per-application sampling stay out of S-0010.

---
id: T-0055
type: task
nature: feature
title: Portcullis proxies /_authstar/upgrade and its pages to web behind the auth gate
status: backlog
parent: S-0007
owner: bytepunx
created: 2026-11-06T18:09:21Z
updated: 2026-11-06T18:09:21Z
transitions: []
stream: S-0007
tags: [portcullis]
touches: [portcullis/crates/authstar-middleware/src/upgrade.rs, portcullis/crates/authstar-middleware/src/lib.rs, portcullis/crates/authstar-proxy/src/main.rs, portcullis/crates/authstar-middleware/tests/integration_tests.rs, portcullis/TESTING.md]
---
# T-0055 Portcullis proxies /_authstar/upgrade and its pages to web behind the auth gate

## Work

No portcullis code reads `webUpstream` yet, though the bundle carries it (`authstar-config/src/bundle.rs`, `authstar-middleware/src/state.rs`). So `/_authstar/upgrade` reaches the application's own upstream, not web. Add a gated router in `authstar-middleware`, a new `upgrade.rs`, as T-0014 of S-0006 did for `/_authstar/me/subscription`. It forwards `GET` and `POST /_authstar/upgrade`, and `GET /_authstar/upgrade/success` and `/_authstar/upgrade/cancelled`, to `{webUpstream}` with the same path. The forward carries the gate's internal JWT and `X-Forwarded-Host`. Merge it into `authstar-proxy`'s `build_app` inside the auth gate. ADR-0065 says the path is not exempt.

An unreachable or timed-out web answers 502 or 504, as any upstream does, with no fallback (ADR-0065). With no `webUpstream`, the path answers 503. Scope is the upgrade paths only. `/oauth2/select` and `/_authstar/link/confirm` from `design/stories/proxy/023-branded-page-proxying.md` stay out of this story.

This task waits for no other task.

## Done when

- `cargo test --workspace` and clippy pass, with tests for these cases:
  - the forward with the internal JWT and host
  - the redirect to sign-in without a session
  - 503 with no web upstream
  - 502 when web is unreachable
- `portcullis/TESTING.md` names the routes.

## Notes

Planned by planner-S-0007. S-0006 changes `authstar-proxy/src/main.rs` and `authstar-middleware/src/lib.rs` too. A trial merge judges the overlap.

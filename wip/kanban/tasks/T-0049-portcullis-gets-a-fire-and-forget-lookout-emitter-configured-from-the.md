---
id: T-0049
type: task
nature: feature
title: Portcullis gets a fire-and-forget lookout emitter configured from the lookoutUpstream bundle key
status: backlog
parent: S-0010
owner: bytepunx
created: 2026-11-06T18:08:43Z
updated: 2026-11-06T18:08:43Z
transitions: []
stream: S-0010
tags: [portcullis, rust]
touches: [portcullis/crates/authstar-config/src/bundle.rs, portcullis/crates/authstar-config/src/validate.rs, portcullis/crates/authstar-middleware/src/analytics.rs, portcullis/crates/authstar-middleware/src/lib.rs, portcullis/crates/authstar-middleware/src/state.rs, portcullis/crates/authstar-proxy/src/main.rs, portcullis/crates/authstar-middleware/tests/integration_tests.rs, portcullis/crates/authstar-proxy/tests/integration_tests.rs, portcullis/crates/authstar-proxy/tests/webhook_tests.rs]
---
# T-0049 Portcullis gets a fire-and-forget lookout emitter configured from the lookoutUpstream bundle key

## Work

- In `portcullis/crates/authstar-config/src/bundle.rs`, add `lookout_upstream: Option<WebUpstreamConfig>` (`lookoutUpstream`) beside `keep_upstream`, and validate it in `validate.rs` where the other upstreams are validated, if they are.
- Write `portcullis/crates/authstar-middleware/src/analytics.rs`: an emitter that posts an event to `{lookout}/events` with the existing `http_client`, inside `tokio::spawn`, with a short timeout, never awaited by the request. A failure, a timeout, or a missing upstream logs at debug at most and never changes the response. The event body is lookout's ingestion shape (`design/stories/lookout/001-ingestion-contract.md`): `tenant`, `application`, `eventType`, `identityHash` only when known, and the type's own fields. Never an IP address and never `accountId`. Register it in `lib.rs`.
- In `state.rs`, carry the lookout base URL beside `keep_base_url` through `build_state` and `PortcullisState`. In `authstar-proxy/src/main.rs`, read `lookoutUpstream` the way `keepUpstream` is read, with a warning when it is absent.
- Update the `build_state` calls and `PortcullisState` literals in the three test files for the new field. Add wiremock tests in `authstar-middleware/tests/integration_tests.rs`: the emitter posts the body it is given, and a lookout that hangs or refuses does not delay or fail the request that emitted.

No `after`: this task is the first portcullis layer, and the lookout task runs beside it.

## Done when

- Portcullis reads `lookoutUpstream` from its signet bundle, and the emitter posts to it without the request waiting.
- The wiremock tests above pass, with `flai test` on portcullis's paths.
- `flai check --strict` passes.

## Notes

Portcullis posts plain in-cluster HTTP, as it does to keep. Lookout listens on plain HTTP and enforces no SPIFFE mTLS today, so Story 020's "over SPIFFE mTLS" is not built here; D-0013 settled the same for keep. reqwest, tokio, serde_json, and wiremock are already dependencies.

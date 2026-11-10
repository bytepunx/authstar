---
id: S-0010
type: story
nature: feature
title: Portcullis emits authentication events to lookout
status: ready
parent: E-0003
owner: alex
created: 2026-10-21T05:13:43Z
updated: 2026-11-10T00:03:32Z
transitions:
  - to: ready
    at: 2026-11-09T20:44:52Z
    by: bytepunx
tags: [portcullis]
topics: [analytics]
touches: [lookout/src/lib/event-types.ts, lookout/src/routes/events.ts, lookout/src/lib/build-app.ts, lookout/spec/behavior/events.spec.ts, lookout/spec/e2e/ingestion-flows.spec.ts, lookout/spec/integration/events.integration.spec.ts, lookout/TESTING.md, design/stories/lookout/001-ingestion-contract.md, portcullis/crates/authstar-config/src/bundle.rs, portcullis/crates/authstar-config/src/validate.rs, portcullis/crates/authstar-middleware/src/analytics.rs, portcullis/crates/authstar-middleware/src/lib.rs, portcullis/crates/authstar-middleware/src/state.rs, portcullis/crates/authstar-proxy/src/main.rs, portcullis/crates/authstar-middleware/tests/integration_tests.rs, portcullis/crates/authstar-proxy/tests/integration_tests.rs, portcullis/crates/authstar-proxy/tests/webhook_tests.rs, portcullis/crates/authstar-middleware/src/oauth/callback.rs, portcullis/crates/authstar-middleware/src/oauth/logout.rs, portcullis/TESTING.md, portcullis/README.md, design/stories/proxy/020-analytics-event-ingestion.md, design/stories/proxy/006-oauth2-callback.md, integration/config/authstar/portcullis.yaml, integration/scripts/scenario-golden-path.sh, integration/README.md, design/system/overview.md, docs/operators/portcullis-configuration.md, docs/operators/index.md]
after: [S-0009]
usage:
  source: sum
  seconds: 0
  models: []
  strategic:
    - kind: orchestrator
      seconds: 16
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 8
          output: 53
          cache_read: 281996
          cache_write: 43754
          cost: 0.3704
cost_of_delay:
  value: 37.5
  by: planner-S-0010
  at: 2026-11-06T18:09:53Z
forecast:
  duration: 6h
  delivery: 2026-11-10T15:36:00Z
  basis: "Its own forecast of 6h; 2nd in the pull order with an in-progress limit of 4, behind S-0006, S-0007, S-0008, S-0013 and S-0005."
  by: flai
  at: 2026-11-10T00:03:32Z
---
# S-0010 Portcullis emits authentication events to lookout

## Goal

Every login attempt, success, failure, and logout at portcullis is posted to lookout as an analytics event in the shape ADR-0058 defines, so chronicle's auth-funnel report has data.

## Acceptance criteria
- [ ] Portcullis has a lookout client configured from signet, posting events asynchronously so a slow or down lookout never delays a request
- [ ] Lookout accepts the server-side `auth.*` event types alongside `client.*`, validated against ADR-0058
- [ ] Chronicle's auth-funnel report returns non-zero counts for a login driven through the integration harness
- [ ] Rust and Node tests cover the emitter and the new event types; `design/system/overview.md` loses the dotted edge

## Tasks
- T-0048 Lookout validates server-side auth.* events against ADR-0058
- T-0049 Portcullis gets a fire-and-forget lookout emitter configured from the lookoutUpstream bundle key
- T-0050 Portcullis's callback and logout dispatch the auth-funnel events
- T-0052 Golden path counts the auth funnel portcullis emits for its real login
- T-0053 Overview draws the portcullis-to-lookout edge as built and operators find lookoutUpstream

## Notes

`portcullis/crates/authstar-middleware/src` has no lookout client; `lookout/src/lib/event-types.ts` lists `client.*` only; `chronicle/src/routes/auth-funnel.ts` expects the funnel events.

### Planning

Touches. The story declared none. `flai touches suggest` needs a start, so it was given the paths the Notes name and the overview; its co-change list matched the explorer's reading of the layout. Every touch is a file; no folder touch is kept.

- Co-change and layout (criterion 1): `authstar-config/src/bundle.rs` and `validate.rs` for the `lookoutUpstream` key beside `keepUpstream`; `authstar-middleware/src/analytics.rs` (new), `lib.rs`, and `state.rs`; `authstar-proxy/src/main.rs`; and the three portcullis test files whose `build_state` calls and `PortcullisState` literals gain the field.
- Layout (criterion 1, goal): `oauth/callback.rs` and `oauth/logout.rs`, where each event occurs. `login.rs` is left out: ADR-0058 has no attempt event.
- Layout (criterion 2): lookout's `event-types.ts`, `routes/events.ts`, `build-app.ts`, its three specs, and `TESTING.md`.
- Layout (criterion 3): `integration/config/authstar/portcullis.yaml` and `integration/scripts/scenario-golden-path.sh`, whose step 6 posts a synthetic event that makes the check pass without portcullis; `integration/README.md`.
- Design (criterion 4, ADR-0058, Story 020): `design/system/overview.md`; `design/stories/proxy/020-analytics-event-ingestion.md` and `006-oauth2-callback.md`, which disagree with ADR-0058 on where `signup-completed` fires; `design/stories/lookout/001-ingestion-contract.md`; `portcullis/TESTING.md` and `README.md`, which mark the dispatch as deferred.
- Documentation convention: `docs/operators/portcullis-configuration.md` (new) and `docs/operators/index.md`, for the new bundle key.
- Chronicle needs no change: its consumer and auth-funnel query already use ADR-0058's names.

Tag `portcullis`, the component the story delivers to, because `flai check` asks for one when it touches several. Topic `analytics` added.

After S-0009. S-0010's criterion 3 reads the auth-funnel report through the golden path's chronicle-report step, which S-0009's T-0038 rewrites to use a portcullis-forwarded ES256 token, and T-0053 adds to the operator settings index S-0009's T-0039 starts in `docs/operators/index.md`.

Forecast: 6h, raised from the default 1h. `flai forecast` had too few done stories with usage, so it used `planning.default_duration`. Five tasks span a Rust emitter, callback and logout wiring with a failure mapping, lookout validation, a live-harness step, and docs, the same spread as S-0009's 6h. Delivery is `flai forecast`'s start, fourth in the pull order, plus 6h.

Cost of delay: 37.50 USD a week, as `flai cod` gives it. S-0010 has no inputs of its own, so it takes its forecast's share of E-0003's 75.00 USD a week (30m lost per cycle at `planning.hour_rate` 150): 6h of the 12h forecast across E-0003's two open stories. It stands unadjusted.

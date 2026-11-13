---
id: S-0006
type: story
nature: feature
title: Serve GET /_authstar/me/subscription for the subscription-status widget
status: review
parent: E-0002
owner: alex
created: 2026-10-21T05:13:12Z
updated: 2026-11-10T03:23:11Z
transitions:
  - to: ready
    at: 2026-10-21T05:29:49Z
    by: claude
  - to: in-progress
    at: 2026-10-21T05:30:00Z
    by: claude
  - to: review
    at: 2026-10-21T05:40:40Z
    by: claude
  - to: in-progress
    at: 2026-11-06T17:56:48Z
    by: bytepunx
  - to: review
    at: 2026-11-10T03:11:14Z
    by: bytepunx
blocked:
  - from: 2026-11-09T07:19:49Z
    until: 2026-11-09T20:48:46Z
    reason: awaiting the operator on TH-0031
  - from: 2026-11-09T21:28:42Z
    until: 2026-11-09T21:39:39Z
    reason: awaiting the operator on TH-0031
  - from: 2026-11-09T21:39:50Z
    until: 2026-11-10T02:37:07Z
    reason: awaiting the operator on TH-0031
  - from: 2026-11-10T02:53:08Z
    until: 2026-11-10T03:11:14Z
    reason: awaiting the operator on TH-0031
tags: [keep, portcullis]
touches: [docs/users/index.md, integration/README.md, integration/scripts/scenario-golden-path.sh, keep/TESTING.md, keep/spec/behavior/me.spec.ts, keep/src/lib/build-app.ts, keep/src/routes/me.ts, portcullis/TESTING.md, portcullis/crates/authstar-middleware/src/lib.rs, portcullis/crates/authstar-middleware/src/me.rs, portcullis/crates/authstar-middleware/src/router.rs, portcullis/crates/authstar-proxy/src/main.rs, portcullis/crates/authstar-proxy/tests/me_tests.rs, web/src/widgets/subscription-status.ts, design/adrs/0111-portcullis-forwards-authstar-me-to-keep-over-its-plain-http-client-until-keep.md, design/adrs/README.md, integration/config/authstar/portcullis.yaml, design/issues/I-0014-a-story-branch-cannot-change-the-harness-s-signet-config-signet-syncs-it-from.md, design/issues/summary.md, design/issues/I-0015-flai-check-finds-roles-definition-outside-the-story-at-close-out.md, design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md, design/issues/I-0019-flai-check-finds-roles-definition-outside-the-story-at-close-out.md, design/issues/I-0007-the-integration-harness-cannot-serve-a-tenant-s-jwks-in-cluster-at-https.md]
usage:
  source: log
  seconds: 4503
  priced_by: harness
  turns:
    - day: 2026-11-09
      ceremony: 6
      work: 124
    - day: 2026-11-10
      work: 38
  models:
    - model: claude-opus-5-5
      input: 362
      output: 65910
      cache_read: 28376792
      cache_write: 615138
      cost: 11.9161
  strategic:
    - kind: orchestrator
      seconds: 142
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 74
          output: 543
          cache_read: 2116216
          cache_write: 323354
          cost: 2.8176
---
# S-0006 Serve GET /_authstar/me/subscription for the subscription-status widget

## Goal

The `<authstar-subscription-status>` widget web already ships gets a real answer: keep serves the current user's subscription status and plan name for the scope the internal JWT names, reached through portcullis's `/_authstar/me/*` proxy family (ADR-0071).

## Acceptance criteria
- [x] Keep exposes the route story keep/006 specifies, authenticated by the internal JWT, returning status and plan name for the caller's account or organization scope
- [x] Portcullis routes `/_authstar/me/subscription` to keep like the other `/_authstar/me/*` routes
- [ ] The widget renders a real status against a running stack in the integration harness's golden path
- [x] `docs/users/` describes the widget and `keep/TESTING.md` the route

## Tasks
- T-0012 Keep serves GET /me/subscription from the forwarded internal JWT
- T-0013 Golden path exercises the widget route against the running stack
- T-0014 Portcullis routes /_authstar/me/subscription to keep with the internal JWT
- T-0015 Widget status union and docs follow ADR-0107 and the new route
- T-0094 Golden path checks its port-forwards without nc and stops them on exit
- T-0095 Harness config gives portcullis keep's upstream
- T-0132 Golden path runs against a story's kluster namespace

## Notes

`web/src/widgets/subscription-status.ts` fetches the route; `keep/TESTING.md` lists it as missing; ADR-0071 and ADR-0041 define the surface.

Criterion 3 is unticked: the golden-path step 4b is written and documented, but this session had no k3d cluster to run it on. Whoever next runs `integration/scripts/scenario-golden-path.sh` ticks it. Verified on 2026-10-21: keep `npm test` 156+2, portcullis `cargo test --workspace` and clippy clean, web `npm test` green.
- 2026-11-06T17:56:48Z: moved to in-progress: Final criterion requires a test against kluster

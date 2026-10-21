---
id: S-0006
type: story
nature: feature
title: Serve GET /_authstar/me/subscription for the subscription-status widget
status: review
parent: E-0002
owner: alex
created: 2026-10-21T05:13:12Z
updated: 2026-10-21T05:40:40Z
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
tags: [keep, portcullis]
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

## Notes

`web/src/widgets/subscription-status.ts` fetches the route; `keep/TESTING.md` lists it as missing; ADR-0071 and ADR-0041 define the surface.

Criterion 3 is unticked: the golden-path step 4b is written and documented, but this session had no k3d cluster to run it on. Whoever next runs `integration/scripts/scenario-golden-path.sh` ticks it. Verified on 2026-10-21: keep `npm test` 156+2, portcullis `cargo test --workspace` and clippy clean, web `npm test` green.

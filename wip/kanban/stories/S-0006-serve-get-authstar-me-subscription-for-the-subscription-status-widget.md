---
id: S-0006
type: story
nature: feature
title: Serve GET /_authstar/me/subscription for the subscription-status widget
status: ready
parent: E-0002
owner: alex
created: 2026-10-21T05:13:12Z
updated: 2026-10-21T05:29:49Z
transitions:
  - to: ready
    at: 2026-10-21T05:29:49Z
    by: claude
tags: []
---
# S-0006 Serve GET /_authstar/me/subscription for the subscription-status widget

## Goal

The `<authstar-subscription-status>` widget web already ships gets a real answer: keep serves the current user's subscription status and plan name for the scope the internal JWT names, reached through portcullis's `/_authstar/me/*` proxy family (ADR-0071).

## Acceptance criteria
- [ ] Keep exposes the route story keep/006 specifies, authenticated by the internal JWT, returning status and plan name for the caller's account or organization scope
- [ ] Portcullis routes `/_authstar/me/subscription` to keep like the other `/_authstar/me/*` routes
- [ ] The widget renders a real status against a running stack in the integration harness's golden path
- [ ] `docs/users/` describes the widget and `keep/TESTING.md` the route

## Tasks

## Notes

`web/src/widgets/subscription-status.ts` fetches the route; `keep/TESTING.md` lists it as missing; ADR-0071 and ADR-0041 define the surface.

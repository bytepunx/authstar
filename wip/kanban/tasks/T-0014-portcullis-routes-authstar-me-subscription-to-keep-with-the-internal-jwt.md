---
id: T-0014
type: task
nature: feature
title: Portcullis routes /_authstar/me/subscription to keep with the internal JWT
status: done
parent: S-0006
owner: alex
created: 2026-10-21T05:34:23Z
updated: 2026-10-21T05:39:59Z
transitions:
  - to: ready
    at: 2026-10-21T05:39:18Z
    by: claude
  - to: in-progress
    at: 2026-10-21T05:39:18Z
    by: claude
  - to: done
    at: 2026-10-21T05:39:59Z
    by: claude
stream: S-0006
tags: []
touches: [portcullis]
---
# T-0014 Portcullis routes /_authstar/me/subscription to keep with the internal JWT

## Work

Add a gated `me_routes()` router in `authstar-middleware` with one handler that forwards `GET /_authstar/me/subscription` to `{keepUpstream}/me/subscription` carrying the gate's internal token as a bearer, relaying keep's status and JSON body; 401 when the gate minted no token, 503 without a keep upstream, 502 when keep is unreachable. Merge it in `authstar-proxy`'s `build_app` inside the auth gate.

## Done when

- `cargo test --workspace` and clippy pass with tests for the forward, the missing token, and the missing upstream; `portcullis/TESTING.md` names the route.

## Notes

ADR-0071 says the family is gated like any protected route and routed by prefix to its owner. Keep is reached over the plain `http_client`, as ADR-0095 chose for webhooks.

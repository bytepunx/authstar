---
id: T-0172
type: task
nature: remediation
title: Harness drops NODE_TLS_REJECT_UNAUTHORIZED from keep's and chronicle's pods
status: done
parent: S-0015
owner: bytepunx
created: 2026-11-14T10:11:47Z
updated: 2026-11-14T10:40:47Z
transitions:
  - to: ready
    at: 2026-11-14T10:39:23Z
    by: agent-S-0015
  - to: in-progress
    at: 2026-11-14T10:39:23Z
    by: agent-S-0015
  - to: done
    at: 2026-11-14T10:40:47Z
    by: agent-S-0015
stream: S-0015
tags: []
touches: [integration/manifests/11-keep.yaml, integration/manifests/14-chronicle.yaml, integration/config/authstar/keep.yaml, integration/config/authstar/chronicle.yaml, integration/README.md]
after: [T-0069, T-0171]
usage:
  source: log
  seconds: 84
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 13
      output: 3035
      cache_read: 1911584
      cache_write: 14448
      cost: 0.5533
---
# T-0172 Harness drops NODE_TLS_REJECT_UNAUTHORIZED from keep's and chronicle's pods

## Work

The harness sets `NODE_TLS_REJECT_UNAUTHORIZED=0` on keep (`integration/manifests/11-keep.yaml`) and chronicle (`integration/manifests/14-chronicle.yaml`) for their https calls to tower, as I-0001's second instance names. Remove both, keeping `NODE_EXTRA_CA_CERTS` for the JWKS host, and rewrite the comments in `integration/config/authstar/keep.yaml`, `integration/config/authstar/chronicle.yaml`, and the Trust row of `integration/README.md` that name the workaround.

Waits for keep's (T-0069) and chronicle's (T-0171) trust-bundle fetch, without which their calls to tower fail.

## Done when

- No file under `integration/` sets `NODE_TLS_REJECT_UNAUTHORIZED`.
- A kluster deploy of the branch passes golden path, or the story's notes say why it could not run.

## Notes

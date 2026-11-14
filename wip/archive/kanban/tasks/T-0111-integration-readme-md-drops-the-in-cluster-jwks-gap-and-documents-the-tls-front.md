---
id: T-0111
type: task
nature: remediation
title: integration/README.md drops the in-cluster JWKS gap and documents the TLS front
status: done
parent: S-0017
owner: bytepunx
created: 2026-11-09T20:56:25Z
updated: 2026-11-13T22:23:44Z
transitions:
  - to: ready
    at: 2026-11-13T21:58:21Z
    by: agent-S-0017
  - to: in-progress
    at: 2026-11-13T21:58:21Z
    by: agent-S-0017
  - to: done
    at: 2026-11-13T22:23:44Z
    by: agent-S-0017
stream: S-0017
tags: [integration, docs]
touches: [integration/README.md]
after: [T-0110]
usage:
  source: log
  seconds: 1523
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 80
      output: 25200
      cache_read: 12940999
      cache_write: 218541
      cost: 4.5398
---
# T-0111 integration/README.md drops the in-cluster JWKS gap and documents the TLS front

## Work

Criterion 5.

- In `integration/README.md` § Not yet done, remove the chronicle bullet (about lines 595-601) and the in-cluster DNS part of the web JWKS bullet (about lines 602-617). Correct the stale claims: portcullis does serve `/.well-known/jwks.json` (`authstar-middleware/src/router.rs`), and tower does patch portcullis once a domain is set (about lines 336-345).
- Document the TLS front: what `harness-tls.sh` makes, the CoreDNS rewrite, chronicle's `NODE_EXTRA_CA_CERTS`, acme's domain, and what step 6 now checks.
- Once criterion 4 has passed on a running harness, close I-0007 with `flai issue close I-0007 --reason` naming the TLS front, the rewrite, and step 6. Until then leave it open and say why in the task's Notes.

It waits for T-0110, so that the README describes what the harness does.

## Done when

- `integration/README.md` lists no in-cluster JWKS gap for chronicle and no stale claim above, and the markdown lint passes on it.
- I-0007 is closed with its reason, or the Notes say why it stays open.

## Notes

---
id: T-0171
type: task
nature: remediation
title: Chronicle verifies tower's certificate against the SPIRE trust bundle
status: done
parent: S-0015
owner: bytepunx
created: 2026-11-14T10:11:41Z
updated: 2026-11-14T10:39:03Z
transitions:
  - to: ready
    at: 2026-11-14T10:26:33Z
    by: agent-S-0015
  - to: in-progress
    at: 2026-11-14T10:26:33Z
    by: agent-S-0015
  - to: done
    at: 2026-11-14T10:39:03Z
    by: agent-S-0015
stream: S-0015
tags: []
touches: [chronicle/src/lib/tower-tls.ts, chronicle/src/server.ts, chronicle/spec/behavior/tower-tls.spec.ts, chronicle/spec/lib/spiffe-test-certs.ts, chronicle/package.json, chronicle/package-lock.json, chronicle/TESTING.md]
after: [T-0054]
usage:
  source: log
  seconds: 750
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 11
      output: 2474
      cache_read: 1664379
      cache_write: 21847
      cost: 0.553
---
# T-0171 Chronicle verifies tower's certificate against the SPIRE trust bundle

## Work

I-0001's second instance: S-0009 gave chronicle the same workaround for its `GET /tenants/:slug` call to tower (`chronicle/src/server.ts`). Chronicle gets its own copy of `tower-tls.ts` as the ADR T-0054 writes describes, the fifth copy under D-0021's decision, and its tenant-domain lookup goes through it. A behavior spec runs real TLS handshakes against a server holding a tower-shaped SVID (URI SAN only) and shows plain `fetch` refuses it while the trust-bundle fetch accepts it.

Waits for T-0054, which fixes the module's shape.

## Done when

- `chronicle/src/server.ts` calls tower through the trust-bundle fetch when `towerBaseUrl` is https, and plain `fetch` when it is http.
- `chronicle/spec/behavior/tower-tls.spec.ts` passes with `flai test`, and fails against plain `fetch`.
- `chronicle/TESTING.md` lists the spec.

## Notes

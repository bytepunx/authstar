---
id: S-0015
type: story
nature: remediation
title: "Node services ship with NODE_TLS_REJECT_UNAUTHORIZED=0 to reach tower over mTLS"
status: backlog
owner: bytepunx
created: 2026-11-06T17:38:17Z
updated: 2026-11-13T21:36:02Z
transitions: []
tags: [herald, keep, steward, web, chart, spiffe, mtls]
touches: [design/adrs/0111-node-services-verify-tower-against-the-spire-trust-bundle.md, design/adrs/README.md, design/tech/tech-stack.md, herald/src/lib/tower-tls.ts, herald/src/server.ts, herald/spec/behavior/tower-tls.spec.ts, herald/spec/lib/spiffe-test-certs.ts, herald/package.json, herald/package-lock.json, herald/TESTING.md, keep/src/lib/tower-tls.ts, keep/src/server.ts, keep/src/lib/role-reference-backfill.ts, keep/spec/behavior/tower-tls.spec.ts, keep/spec/lib/spiffe-test-certs.ts, keep/package.json, keep/package-lock.json, keep/TESTING.md, steward/src/lib/server/tower-tls.ts, steward/src/hooks.server.ts, steward/tests/behavior/tower-tls.spec.ts, steward/tests/helpers/spiffe-test-certs.ts, steward/package.json, steward/package-lock.json, steward/TESTING.md, web/src/lib/server/tower-tls.ts, web/src/hooks.server.ts, web/spec/behavior/tower-tls.spec.ts, web/spec/fixtures/spiffe-test-certs.ts, web/package.json, web/package-lock.json, web/TESTING.md, chart/values.yaml, chart/README.md, design/stories/chart/001-chart-layout-and-provisioning-hook.md, design/issues/I-0001-node-services-ship-with-node-tls-reject-unauthorized-0-to-reach-tower-over-mtls.md, design/issues/summary.md]
usage:
  source: sum
  seconds: 0
  models: []
  strategic:
    - kind: orchestrator
      seconds: 47
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 22
          output: 152
          cache_read: 760521
          cache_write: 116720
          cost: 0.9832
forecast:
  duration: 4h
  delivery: 2026-11-14T23:24:00Z
  basis: "Its own forecast of 4h; 7th in the pull order with an in-progress limit of 4, behind S-0006, S-0013, S-0025, S-0012, S-0007, S-0008, S-0017, S-0010 and S-0014."
  by: flai
  at: 2026-11-13T21:36:02Z
finalized:
  by: bytepunx
  at: 2026-11-09T22:06:33Z
---
# S-0015 Node services ship with NODE_TLS_REJECT_UNAUTHORIZED=0 to reach tower over mTLS

## Goal

This story remediates [I-0001](../../../design/issues/I-0001-node-services-ship-with-node-tls-reject-unauthorized-0-to-reach-tower-over-mtls.md), "Node services ship with NODE_TLS_REJECT_UNAUTHORIZED=0 to reach tower over mTLS". The issue recommends no solution yet: propose one from its instances before building it.

## Acceptance criteria
- [ ] The cause I-0001 describes no longer occurs, with a test that reproduces it where one fits
- [ ] I-0001 is closed with `flai issue close I-0001 --reason` saying what fixed it

## Tasks
- T-0054 Record in an ADR how Node services verify tower against the SPIRE trust bundle
- T-0056 Herald verifies tower's certificate against the SPIRE trust bundle
- T-0069 Keep verifies tower's certificate against the SPIRE trust bundle
- T-0072 Steward verifies tower's certificate against the SPIRE trust bundle
- T-0075 Web verifies tower's certificate against the SPIRE trust bundle
- T-0077 Chart drops NODE_TLS_REJECT_UNAUTHORIZED from every service
- T-0079 Close I-0001 naming the trust-bundle agents and their specs

## Notes

### Planning

The proposed solution: each Node service that calls tower trusts the SPIRE trust bundle for tower's origin alone, and the chart stops turning verification off. The fix is recorded as an ADR first (T-0054).

The code differs from the issue's instance. `chart/values.yaml` sets `NODE_TLS_REJECT_UNAUTHORIZED=0` on herald, keep, steward, and web. Tower's own `extraEnv` is empty. Each of the four makes a plain `fetch()` to tower's `https://` base URL, and tower always serves TLS with its SPIFFE SVID. That SVID carries only a `spiffe://` URI SAN. Node's hostname check reads DNS and IP SANs only, so the CA alone is not enough: the agent also checks tower's SPIFFE ID in `checkServerIdentity`. No service passes a CA to a client today, and no shared helper exists.

Touches, all files, no folders:

| touch | source | why |
|---|---|---|
| `design/adrs/0111-node-services-verify-tower-against-the-spire-trust-bundle.md` | design | the decision the goal asks for (T-0054); `flai adr new` may number it otherwise, since 0107 to 0110 sit on other stories' branches |
| `design/adrs/README.md` | design | indexes the ADR (T-0054) |
| `design/tech/tech-stack.md` | design | names `undici`, `spiffe`, and `@peculiar/x509` for the four services (T-0054) |
| `herald/src/lib/tower-tls.ts`, `herald/src/server.ts` | layout | herald's tenant-domain lookup to tower (T-0056) |
| `herald/spec/behavior/tower-tls.spec.ts`, `herald/spec/lib/spiffe-test-certs.ts`, `herald/TESTING.md` | layout | the spec that reproduces the cause, its cert helper, and its listing (T-0056) |
| `herald/package.json`, `herald/package-lock.json` | layout | the added dependencies (T-0056) |
| `keep/src/lib/tower-tls.ts`, `keep/src/server.ts`, `keep/src/lib/role-reference-backfill.ts` | layout | keep's tenant-domain lookup and role-reference backfill to tower (T-0069) |
| `keep/spec/behavior/tower-tls.spec.ts`, `keep/spec/lib/spiffe-test-certs.ts`, `keep/TESTING.md` | layout | the spec, its cert helper, and its listing (T-0069) |
| `keep/package.json`, `keep/package-lock.json` | layout | the added dependencies (T-0069) |
| `steward/src/lib/server/tower-tls.ts`, `steward/src/hooks.server.ts` | layout | a `handleFetch` sends steward's tower requests through the agent, so the routes stay as they are (T-0072) |
| `steward/tests/behavior/tower-tls.spec.ts`, `steward/tests/helpers/spiffe-test-certs.ts`, `steward/TESTING.md` | layout | the spec, its cert helper, and its listing (T-0072) |
| `steward/package.json`, `steward/package-lock.json` | layout | the added dependencies (T-0072) |
| `web/src/lib/server/tower-tls.ts`, `web/src/hooks.server.ts` | layout | web's tenant-domain lookup and a `handleFetch` for its tower client (T-0075) |
| `web/spec/behavior/tower-tls.spec.ts`, `web/spec/fixtures/spiffe-test-certs.ts`, `web/TESTING.md` | layout | the spec, its cert helper, and its listing (T-0075) |
| `web/package.json`, `web/package-lock.json` | layout | the added dependencies (T-0075) |
| `chart/values.yaml` | design | the issue's instance: the four `extraEnv` entries and the header that names them (T-0077) |
| `chart/README.md` | design | its `<service>.extraEnv` row names the workaround (T-0077) |
| `design/stories/chart/001-chart-layout-and-provisioning-hook.md` | design | names the workaround (T-0077) |
| `design/issues/I-0001-node-services-ship-with-node-tls-reject-unauthorized-0-to-reach-tower-over-mtls.md`, `design/issues/summary.md` | design | `flai issue close` rewrites them, the second criterion (T-0079) |

`flai touches suggest` listed co-change paths in keep and herald at 14% or less, such as `keep/src/lib/build-app.ts` and `herald/src/lib/build-app.ts`. I left them out: the calls to tower are made in the entrypoints, not in the apps' builders.

The story declared no touches before this plan, so none was kept. No `after`: the story reads no other story's output. S-0016 (I-0002, tower's SVID rotation) is about the same link from tower's side and changes only tower's files.

Forecast: `flai forecast` gave 1h, `planning.default_duration`, since only one done story has usage. I raised it to 4h. The story has seven tasks in four layers, and four of them each add dependencies and a spec that runs real TLS handshakes with generated certificates in a different service. Delivery is flai's date for 8th in the pull order, plus those three hours.

Cost of delay: not set yet. S-0015 has no inputs and no epic, so `flai cod S-0015` refuses. The inputs are asked for on TH-0013.

Assumptions:

- No test tier in `system-flow.yaml` runs these services' tests, as TH-0009 and TH-0012 found for keep, web, and chronicle. The tasks name `npm run test:behavior` in each service, and the story's agent follows the operator's answer on those threads.
- The integration bundles under `integration/config/authstar/` give tower as `http://`, so they take no agent, and this story leaves them alone.
- Portcullis is Rust and already dials tower with its own SPIFFE client; it is out of scope.

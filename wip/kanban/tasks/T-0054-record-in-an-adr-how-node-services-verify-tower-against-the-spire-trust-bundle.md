---
id: T-0054
type: task
nature: remediation
title: Record in an ADR how Node services verify tower against the SPIRE trust bundle
status: backlog
parent: S-0015
owner: bytepunx
created: 2026-11-06T18:09:11Z
updated: 2026-11-06T18:09:11Z
transitions: []
stream: S-0015
tags: [adr, spiffe, mtls]
touches: [design/adrs/0111-node-services-verify-tower-against-the-spire-trust-bundle.md, design/adrs/README.md, design/tech/tech-stack.md]
---
# T-0054 Record in an ADR how Node services verify tower against the SPIRE trust bundle

## Work

I-0001 names no fix, so the story proposes one before it builds it. Record it as an ADR with `flai adr new`.

The proposal, from the code as it stands:

- `chart/values.yaml` sets `NODE_TLS_REJECT_UNAUTHORIZED=0` on herald, keep, steward, and web, not on tower. Each makes a plain `fetch()` to tower's `https://` base URL, and tower always serves TLS with its SPIFFE SVID (`tower/src/lib/build-app.ts`).
- Tower's SVID carries only a `spiffe://` URI SAN, so trusting the SPIRE CA is not enough: Node's hostname check reads DNS and IP SANs only.
- Each of the four services builds an `undici` `Agent` for tower's origin alone. Its `ca` is the X.509 bundle from the Workload API (`spiffe`'s `createClient`, as `tower/src/lib/spiffe-mtls.ts` reads it), refreshed when the bundle rotates. Its `checkServerIdentity` accepts tower's SPIFFE ID, `spiffe://<trustDomain>/ns/<namespace>/sa/tower`, in place of the hostname. Every other outbound call keeps Node's default verification.
- Each service holds its own small module, not a shared package, since no shared library for services exists. `clients/typescript/core` is the package tenants' applications use, so it is not the place for SPIRE wiring.
- An `http://` tower URL, as Env-Only Mode and the integration bundles use, takes no agent and stays plain.

Write the decision, its alternatives, and their trade-offs: a process-wide `NODE_EXTRA_CA_CERTS` file, which cannot match a URI SAN and is not refreshed; a shared package; and a DNS SAN on tower's SVID. Index the ADR in `design/adrs/README.md`. Add `undici`, `spiffe`, and `@peculiar/x509`, the last a test dependency, for herald, keep, steward, and web in `design/tech/tech-stack.md`.

`flai adr new` takes the next free number, so the file's number may differ from 0111: ADRs 0107 to 0110 sit on other stories' branches. `flai task done` widens the touches to the real path.

This task waits for no other: it is the first layer.

## Done when

- An accepted ADR under `design/adrs/` records the trust-bundle agent, the SPIFFE ID check, and the alternatives, and links I-0001.
- `design/adrs/README.md` indexes it.
- `design/tech/tech-stack.md` names the packages the four services add and why.
- `flai check --strict` passes.

## Notes

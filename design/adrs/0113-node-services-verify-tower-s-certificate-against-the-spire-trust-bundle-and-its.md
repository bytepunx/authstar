---
id: ADR-0113
title: "Node services verify tower's certificate against the SPIRE trust bundle and its SPIFFE trust domain, for tower's origin alone"
status: accepted
date: 2026-11-14
supersedes: []
superseded_by: []
---

# ADR-0113 Node services verify tower's certificate against the SPIRE trust bundle and its SPIFFE trust domain, for tower's origin alone

## Context

Tower always serves TLS with its SPIFFE X.509-SVID (`tower/src/lib/spiffe-mtls.ts`). Five Node services call it over `https://`: chronicle, herald, and keep (each tenant's domain, through `GET /tenants/:slug`; keep also for its role-reference backfill), and steward and web (their tower clients). None of them trusts the SPIRE CA, so the chart and the harness set `NODE_TLS_REJECT_UNAUTHORIZED=0` on each ([I-0001](../issues/I-0001-node-services-ship-with-node-tls-reject-unauthorized-0-to-reach-tower-over-mtls.md)). That turns certificate verification off for every outbound call the process makes, Stripe, signet, and the tenants' JWKS hosts included.

Trusting the CA alone is not enough. Tower's SVID carries only a `spiffe://` URI SAN, and Node's hostname check reads DNS and IP SANs only, so a CA-valid SVID still fails `checkServerIdentity` for `tower.<namespace>.svc.cluster.local`.

The services already reach the SPIFFE Workload API: `@bytepunx/signet-client` dials signet through it, and its `spiffe` package (0.5.1) streams the workload's SVID and trust bundle.

## Decision

Each Node service that calls tower holds a module, `tower-tls.ts`, that verifies tower's certificate itself, and calls tower through it whenever tower's base URL is `https://`. Every other outbound call keeps Node's default verification. With an `http://` base URL, as Env-Only Mode and the harness's bundles use, the service calls tower with plain `fetch`.

- **Trust.** The module streams the service's own X.509-SVID context from the Workload API (`FetchX509SVID`, `SPIFFE_ENDPOINT_SOCKET`). From each push it keeps the trust bundle as PEM and the trust domain, the host of the service's own SPIFFE ID, replacing both on each later push. It resolves once the first push arrives. When the stream ends, it logs at `fatal` and exits, so Kubernetes restarts the service into a fresh stream, as tower's `watchSVIDRotation` does.
- **Identity.** A peer certificate passes when its chain verifies against the bundle and its URI SAN is a SPIFFE ID in that trust domain. This replaces the hostname check, and it is the policy tower and portcullis already apply on the same link: any workload of the installation's trust domain.
- **Transport.** The module answers a `fetch`-shaped function built on `node:https`, with the bundle as `ca` and the SPIFFE check as `checkServerIdentity`, that returns a standard `Response`. Herald, keep, and chronicle pass it where they call tower. Steward and web return it from SvelteKit's `handleFetch` for requests to tower's origin, so their tower clients and routes stay as they are.
- **Shape.** Every copy exports the same five names: `TowerTrust` (`{ caPem, trustDomain }`), `checkSpiffeServerIdentity(trustDomain)`, `createTowerFetch(currentTrust)`, `watchTowerTrust(client?)`, and `towerFetchFor(towerBaseUrl)`, which answers plain `fetch` for `http://` and the trust-bundle fetch for `https://`.
- **Copies.** Each of the five services has its own copy, not a shared package, by the operator's answer on TH-0026 (D-0021). A later story merges them.
- **Configuration.** With the five services verifying tower themselves, the chart and the harness stop setting `NODE_TLS_REJECT_UNAUTHORIZED`.

## Consequences

- A forged or self-signed certificate on any outbound call of these services fails again, as Node's defaults intend.
- Each service declares `spiffe` 0.5.1 as its own dependency rather than reaching it through `@bytepunx/signet-client`, and `@peculiar/x509` 1.14.3 as a dev dependency for the specs' generated certificates ([tech stack](../tech/tech-stack.md)).
- An `https://` tower URL now needs the Workload API: a service started with one and no `SPIFFE_ENDPOINT_SOCKET` fails at boot, naming the variable.
- Five copies of one module must change together until they are merged.
- The fetch function reads the whole response body before it answers. Tower's responses to these services are small JSON documents; nothing streams.

## Alternatives considered

- **An `undici` `Agent` passed as `dispatcher` to global `fetch`.** Needs `undici` as a dependency whose major must match the one Node bundles, and SvelteKit's `handleFetch` would mix two `Response` classes; `node:https` needs nothing new.
- **`NODE_EXTRA_CA_CERTS` with the SPIRE bundle written to a file.** Trusts the CA process-wide but still fails the hostname check, and does not follow bundle rotation.
- **Give tower's SVID a DNS SAN.** Depends on SPIRE registration entries per namespace, and still leaves each service without the CA.
- **One shared package for the five services.** Rejected for now by the operator on TH-0026; no shared library for services exists, and `clients/typescript/core` is the tenants' package.

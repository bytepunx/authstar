---
id: S-0017
type: story
nature: remediation
title: Golden path reads chronicle's report with a portcullis-forwarded ES256 token
status: backlog
parent: E-0003
owner: bytepunx
created: 2026-11-06T18:29:54Z
updated: 2026-11-06T18:29:54Z
transitions: []
tags: [integration]
agent:
  harness: claude-code
  model: claude-opus-5-5
  config:
    effort: high
draft: true
---
# S-0017 Golden path reads chronicle's report with a portcullis-forwarded ES256 token

## Goal

The integration harness's golden path reads a chronicle report through portcullis with the ES256 internal JWT portcullis mints, and chronicle verifies it against the tenant's JWKS inside the cluster. This is the harness half of S-0009's criterion 3, split out on TH-0021.

## Acceptance criteria
- [ ] Inside the cluster, `https://authstar.<acme's domain>/.well-known/jwks.json` resolves to portcullis and serves over TLS. The cert is one chronicle trusts.
- [ ] The golden path's step 1 gives `acme` a domain, so tower answers it to `GET /tenants/acme`.
- [ ] Chronicle's harness config reaches tower and the JWKS host, and `NODE_TLS_REJECT_UNAUTHORIZED=0` is not added beyond what I-0001 already records.
- [ ] Step 6 of `integration/scripts/scenario-golden-path.sh` reads chronicle's auth-funnel report through a portcullis application with step 2's session cookie, and passes on a running harness.
- [ ] `integration/README.md` no longer lists the in-cluster JWKS gap.

## Tasks

## Notes

Recorded as I-0007. Findings from S-0009's T-0038:

- Portcullis already forwards its ES256 internal JWT, with the `tenant` header, as `Authorization: Bearer` to any application upstream (`portcullis/crates/authstar-proxy/src/proxy/mod.rs`, `crates/authstar-middleware/src/jwt/internal.rs`). An `acme` application in `integration/config/authstar/portcullis.yaml` whose upstream is `http://chronicle.authstar.svc.cluster.local:3000` delivers a real token.
- `@bytepunx/authstar-fastify` builds the JWKS URL as `https://authstar.<domain>/.well-known/jwks.json`, with the scheme fixed. Portcullis listens plain HTTP on 3710; nothing in `integration/` terminates TLS.
- No CoreDNS rewrite or Service alias maps `authstar.<domain>` in-cluster.
- Step 1 posts `/tenants` without `domain`, so the tenant is domain-pending (ADR-0093).
- Herald and keep have the same in-cluster gap, and their harness `towerBaseUrl` is `http://` while tower serves only https (I-0006).

Needs a live k3d harness to verify. Until it lands, S-0009 leaves step 6 skipping chronicle with the reason.

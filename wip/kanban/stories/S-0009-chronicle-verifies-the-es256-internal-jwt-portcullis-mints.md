---
id: S-0009
type: story
nature: remediation
title: Chronicle verifies the ES256 internal JWT portcullis mints
status: ready
parent: E-0003
owner: alex
created: 2026-10-21T05:13:43Z
updated: 2026-10-21T05:13:56Z
transitions:
  - to: ready
    at: 2026-10-21T05:13:56Z
    by: claude
tags: []
---
# S-0009 Chronicle verifies the ES256 internal JWT portcullis mints

## Goal

Chronicle's `analytics:read` routes accept the internal JWT portcullis forwards, verified against the tenant's JWKS the way web and the SDKs verify it, so the shared-secret HS256 path and its insecure default are gone.

## Acceptance criteria
- [ ] Chronicle verifies ES256 tokens per tenant via the JWKS URL convention (ADR-0086, ADR-0091), using the same verification the `@bytepunx/authstar-core` client provides
- [ ] `CHRONICLE_INTERNAL_JWT_SECRET` and the `dev-only-insecure-secret` default are removed from config, the chart, and the integration manifests
- [ ] Behavior and e2e tests mint ES256 test tokens; the integration harness's chronicle-report step passes with a genuine portcullis-forwarded token
- [ ] `docs/operators/` lists chronicle's configuration

## Tasks

## Notes

`chronicle/src/lib/auth.ts` and `config.ts`; `portcullis/crates/authstar-middleware/src/jwt/internal.rs` signs ES256. The integration README records that the golden path self-mints an HS256 token because a real one could never pass.

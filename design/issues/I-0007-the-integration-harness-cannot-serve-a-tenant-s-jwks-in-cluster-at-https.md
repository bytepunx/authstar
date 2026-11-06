---
id: I-0007
title: "The integration harness cannot serve a tenant's JWKS in-cluster at https://authstar.<domain>"
class: blocker
status: open
count: 1
cost: 30m
first_reported: 2026-11-06T18:09:56Z
last_reported: 2026-11-06T18:09:56Z
updated: 2026-11-06T18:09:56Z
---

# I-0007 The integration harness cannot serve a tenant's JWKS in-cluster at https://authstar.<domain>

## Description
The integration harness cannot serve a tenant's JWKS in-cluster at https://authstar.<domain>

## Instances

### 2026-11-06T18:09:56Z
Story: S-0009.
S-0009 T-0038: no service can verify a portcullis-forwarded internal JWT inside the harness. @bytepunx/authstar-fastify's perTenantJwksKeyProvider builds https://authstar.<domain>/.well-known/jwks.json with the scheme fixed; portcullis listens plain HTTP on 3710 (portcullis/crates/authstar-proxy/src/main.rs); nothing in integration/ terminates TLS or maps authstar.<domain> to a cluster Service (no CoreDNS rewrite; README "Not yet done"); and the golden path's step 1 creates acme without a domain, so tower answers none. Fixing it needs a TLS front with a self-signed cert, a CoreDNS rewrite, chronicle CA trust, and the script and portcullis config changes. It blocks the golden path's chronicle step from using a genuine token, and the same path for herald, keep, and web.

## Remediation

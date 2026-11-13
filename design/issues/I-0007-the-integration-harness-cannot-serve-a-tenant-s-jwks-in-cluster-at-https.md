---
id: I-0007
title: "The integration harness cannot serve a tenant's JWKS in-cluster at https://authstar.<domain>"
class: blocker
status: closed
count: 3
cost: 30m
first_reported: 2026-11-06T18:09:56Z
last_reported: 2026-11-13T21:39:49Z
updated: 2026-11-14T08:41:32Z
---

# I-0007 The integration harness cannot serve a tenant's JWKS in-cluster at https://authstar.<domain>

## Description
The integration harness cannot serve a tenant's JWKS in-cluster at https://authstar.<domain>

## Instances

### 2026-11-06T18:09:56Z
Story: S-0009.
S-0009 T-0038: no service can verify a portcullis-forwarded internal JWT inside the harness. @bytepunx/authstar-fastify's perTenantJwksKeyProvider builds https://authstar.<domain>/.well-known/jwks.json with the scheme fixed; portcullis listens plain HTTP on 3710 (portcullis/crates/authstar-proxy/src/main.rs); nothing in integration/ terminates TLS or maps authstar.<domain> to a cluster Service (no CoreDNS rewrite; README "Not yet done"); and the golden path's step 1 creates acme without a domain, so tower answers none. Fixing it needs a TLS front with a self-signed cert, a CoreDNS rewrite, chronicle CA trust, and the script and portcullis config changes. It blocks the golden path's chronicle step from using a genuine token, and the same path for herald, keep, and web.

### 2026-11-10T03:23:11Z
Story: S-0006.
S-0006's golden path ran against kluster namespace s-0006 (deploy bb1c2f1). Steps 1–4 passed. Step 4b, GET /_authstar/me/subscription through portcullis with a real Dex session, reached keep, whose log shows GET /me/subscription answered 403 {"error":"forbidden"}. Keep verifies the internal JWT with perTenantJwksKeyProvider (keep/src/lib/build-app.ts, keep/src/server.ts). That fetches https://authstar.<domain>/.well-known/jwks.json with the domain resolved from tower, which the harness cannot serve, and step 1 creates acme without a domain. With no verified claims, keep's /me route answers 403. Keep is a second consumer, after chronicle, blocked by the same gap S-0017 fixes.

### 2026-11-13T21:39:49Z
Story: S-0006.
S-0006's golden path ran against kluster namespace s-0006 at 7a4cd57 (rebased onto main with S-0005). Steps 1 to 4, 5, and 6 passed; step 4b, GET /_authstar/me/subscription through portcullis with a real Dex session, answered 403 {"error":"forbidden"} from keep again. The operator chose that S-0006 waits for S-0017.

## Remediation
Closed 2026-11-14T08:41:32Z: S-0017. Chronicle's pod now reaches the tenant's JWKS host through an in-pod TLS front, signed by a harness CA that each deploy loads as Secret authstar-tls. Golden path step 1 gives acme its domain, and portcullis.yaml gives acme `_admin` and `chronicle` applications. Tower registers `_admin` without replacing a tenant portcullis already configures. Portcullis sends the login email, so the first-admin invite is redeemed.

Verified live on S-0017's kluster namespace s-0017 at 8b350d4, from inside the namespace:
- The JWKS fetch from chronicle's container with `NODE_TLS_REJECT_UNAUTHORIZED` unset answered 200 with 1 key.
- `POST /tenants` with the domain answered 201.
- The invite login was accepted, and `analytics:read` was granted.
- The auth-funnel report through portcullis on chronicle.acme.authstar.app answered 200.

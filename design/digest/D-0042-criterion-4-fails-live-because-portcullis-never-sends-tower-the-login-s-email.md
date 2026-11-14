---
id: D-0042
title: "Criterion 4 fails live because portcullis never sends tower the login's email, so no invite can be redeemed: fix portcullis in S-0017: 1"
kind: answer
sources: [TH-0048, S-0017, T-0140]
topics: [portcullis, tower, rust, integration, code, all]
paths: [portcullis/crates/authstar-middleware/src/identities.rs, portcullis/crates/authstar-middleware/src/oauth/callback.rs, portcullis/crates/authstar-middleware/tests/integration_tests.rs, tower/src/routes/identities.ts, design/stories/proxy/006-oauth2-callback.md, integration/scripts/scenario-golden-path.sh]
date: 2026-11-14
status: active
absorbed_by: ""
asked_again: []
cited: [TH-0049]
---

# D-0042 Criterion 4 fails live because portcullis never sends tower the login's email, so no invite can be redeemed: fix portcullis in S-0017: 1

Portcullis sends the login's email to tower's `/identities/resolve`, fixed in S-0017 rather than split off: without it no first-admin invite is ever redeemed.

S-0017's agent found on TH-0048 why chronicle answered `403 missing required permission: analytics:read` live: "Portcullis's `/identities/resolve` body has no `email` field (`portcullis/crates/authstar-middleware/src/identities.rs`, `ResolveRequestBody`). The callback has the email from userinfo (`oauth/callback.rs`) but does not pass it." Tower then makes a new account's contact with `contactStore.upsert(tenant, body.email ?? '')`, an empty-email contact, and "`redeemInvite` requires the account's contact to be the invite's. So the first-admin invite (ADR 0092) is never redeemed at any first login, and the account gets no permissions." It offered (1) fix portcullis in S-0017, (2) a separate remediation story with criterion 4 unticked, or (3) a harness-only grant.

The operator, bytepunx, answered at 2026-11-14T05:01:49Z: "1". T-0140 adds `email` to `ResolveRequestBody` and `resolve_identity`, passes the userinfo email from the callback, and tests it. An account already bound to an empty contact stays so: the namespace is torn down and redeployed after the fix. S-0010 also changes `callback.rs`; the split is agreed on MS-0034.

Source: TH-0048, S-0017, T-0140.

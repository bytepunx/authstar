---
id: D-0013
title: "me family reaches keep over plain HTTP, not SPIFFE mTLS: accept recommendation"
kind: answer
sources: [TH-0002, S-0006]
topics: [keep, portcullis, rust, tls]
paths: [portcullis/crates/authstar-middleware/src/me.rs, portcullis/crates/authstar-middleware/src/router.rs, keep/src/routes/me.ts, design/adrs/0111-portcullis-forwards-authstar-me-to-keep-over-its-plain-http-client-until-keep.md]
date: 2026-11-06
status: absorbed
absorbed_by: "design/adrs/0111-portcullis-forwards-authstar-me-to-keep-over-its-plain-http-client-until-keep.md#decision"
asked_again: []
cited: [T-0049, TH-0020, TH-0067]
---

# D-0013 me family reaches keep over plain HTTP, not SPIFFE mTLS: accept recommendation

The operator, bytepunx, answered TH-0002 at 2026-11-06T17:59:32Z.

What was asked:

```text
ADR-0071 says portcullis forwards /_authstar/me/* to its owning backend over SPIFFE mTLS. S-0006 implemented /_authstar/me/subscription over portcullis's plain http_client, the same path ADR-0095 chose for Stripe webhook forwarding, because the SPIFFE mTLS client exists for tower only (portcullis/TESTING.md: keep, herald, lookout, web still to come). Recommendation: accept plain HTTP for keep until the east-west mTLS story covers keep, and record that in a short ADR refining 0071; the alternative is to block S-0006 on keep's mTLS listener.
```

The answer:

```text
accept recommendation
```

S-0006, accepted 2026-11-14, shipped it so, and recorded it as ADR-0111, which refines ADR-0071. Its narrative's Decisions: "Portcullis reaches keep over the plain HTTP client, as ADR-0095 chose for webhooks, not SPIFFE mTLS as ADR-0071 says, because the mTLS client is tower-only today."

Source: TH-0002, S-0006.

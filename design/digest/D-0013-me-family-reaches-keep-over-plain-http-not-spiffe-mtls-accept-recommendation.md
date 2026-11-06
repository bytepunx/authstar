---
id: D-0013
title: "me family reaches keep over plain HTTP, not SPIFFE mTLS: accept recommendation"
kind: answer
sources: [TH-0002]
topics: []
paths: []
date: 2026-11-06
status: active
absorbed_by: ""
asked_again: []
cited: []
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

Source: TH-0002.

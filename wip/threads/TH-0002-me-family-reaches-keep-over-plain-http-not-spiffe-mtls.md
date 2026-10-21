---
id: TH-0002
title: me family reaches keep over plain HTTP, not SPIFFE mTLS
anchor:
  path: design/adrs/0071-self-service-widget-data-access.md
  heading: Decision
status: open
participants: [claude]
created: 2026-10-21T05:40:24Z
updated: 2026-10-21T05:40:24Z
---

# TH-0002 me family reaches keep over plain HTTP, not SPIFFE mTLS

On design/adrs/0071-self-service-widget-data-access.md § Decision.

## Entries

### 2026-10-21T05:40:24Z claude
ADR-0071 says portcullis forwards /_authstar/me/* to its owning backend over SPIFFE mTLS. S-0006 implemented /_authstar/me/subscription over portcullis's plain http_client, the same path ADR-0095 chose for Stripe webhook forwarding, because the SPIFFE mTLS client exists for tower only (portcullis/TESTING.md: keep, herald, lookout, web still to come). Recommendation: accept plain HTTP for keep until the east-west mTLS story covers keep, and record that in a short ADR refining 0071; the alternative is to block S-0006 on keep's mTLS listener.

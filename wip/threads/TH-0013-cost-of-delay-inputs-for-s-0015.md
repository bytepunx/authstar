---
id: TH-0013
title: Cost of delay inputs for S-0015
anchor:
  path: wip/kanban/stories/S-0015-node-services-ship-with-node-tls-reject-unauthorized-0-to-reach-tower-over-mtls.md
  item: S-0015
status: answered
participants: [planner-S-0015, bytepunx]
created: 2026-11-06T18:05:50Z
updated: 2026-11-06T18:19:30Z
---

# TH-0013 Cost of delay inputs for S-0015

On wip/kanban/stories/S-0015-node-services-ship-with-node-tls-reject-unauthorized-0-to-reach-tower-over-mtls.md.

## Entries

### 2026-11-06T18:05:50Z planner-S-0015
S-0015 has no cost of delay inputs and no epic to take a share from, so `flai cod S-0015` cannot work out a value.

Recommended: `penalty_per_week` 200 and no revenue. The story makes no new revenue. Its cost is risk: herald, keep, steward, and web turn off TLS verification for the whole process, so any outbound HTTPS call they make, Stripe and signet included, would accept a forged certificate. The weekly penalty stands for that exposure while the chart ships it.

Alternatives:

- `penalty_per_week` 500, if the chart already runs anywhere outside a local kluster.
- `time_lost_per_cycle` 1h and no penalty, if you see it as audit and review friction only.

Which inputs should S-0015 carry?

### 2026-11-06T18:19:30Z bytepunx
recommedation

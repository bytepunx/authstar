---
id: D-0040
title: "invoice.paid restores a dispute-degraded subscription too, once it is active or trialing; no rule holds a dispute's degrade against a paid invoice"
kind: decision
sources: [S-0005, T-0076, T-0080]
topics: [billing, keep]
paths: [keep/src/routes/webhooks.ts, design/stories/keep/002-stripe-webhook-handling.md]
date: 2026-11-13
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0040 invoice.paid restores a dispute-degraded subscription too, once it is active or trialing; no rule holds a dispute's degrade against a paid invoice

S-0005 met a case keep's webhook contract leaves open: a subscription a dispute degraded, then a paid invoice. Its narrative's Decisions: "`invoice.paid` restores any degraded subscription that is `active` or `trialing`, one degraded by a dispute included. That follows ADR-0107 as written, and a later `won` is then a no-op. Holding a dispute's degrade against a paid invoice would need a new rule, and none is decided."

So a dispute's degrade lasts only until the next paid invoice on an `active` or `trialing` subscription. A `charge.dispute.closed` with `won` then restores nothing, and a `lost` one changes no entitlement, as `design/stories/keep/002-stripe-webhook-handling.md` says. A subscription already degraded when the dispute opens is not named on the dispute, so a won dispute restores nothing for it either.

Keeping a disputed subscription degraded through a paid invoice is a new decision, for an ADR, not a change a story makes on its own.

Source: S-0005 (narrative, Decisions), T-0076, T-0080.

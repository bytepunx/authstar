---
id: D-0049
title: A story whose live criterion waits on another story's fix stays in progress, blocked with after set on that story, rather than going to review with the criterion unticked (the operator's choice for S-0006)
kind: decision
sources: [S-0006, S-0017, I-0007]
topics: [integration, kluster, all]
paths: [integration/scripts/scenario-golden-path.sh]
date: 2026-11-14
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0049 A story whose live criterion waits on another story's fix stays in progress, blocked with after set on that story, rather than going to review with the criterion unticked (the operator's choice for S-0006)

S-0006's criterion 3, the golden path reading the real subscription status through portcullis, could not pass until S-0017 let the harness serve the tenant's JWKS in-cluster (I-0007, D-0019). Its agent offered the operator three routes on TH-0031: move the proof to S-0017, wait for S-0017, or go to review with the criterion unticked.

The operator chose to wait. S-0006's narrative's Decisions, 2026-11-13: "the operator chose that S-0006 waits in progress for S-0017 rather than going to review with criterion 3 unticked; the holds on S-0007, S-0008, and S-0010 stay (D-0019, I-0007)." The story took `after: S-0017` and was blocked from 2026-11-13T21:39:49Z with the reason "criterion 3 waits on S-0017". Once S-0017 was accepted, it synced onto main, the operator had keep's harness wiring added to S-0006 itself (D-0019), and the criterion passed live before review.

TH-0034 (S-0007) and TH-0043 (S-0010) ask the same question for their own criteria. This is the precedent, not a rule: the operator answers each such thread.

Source: S-0006, S-0017, I-0007.

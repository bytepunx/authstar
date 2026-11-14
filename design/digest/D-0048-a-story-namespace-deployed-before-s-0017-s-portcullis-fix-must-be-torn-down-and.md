---
id: D-0048
title: "A story namespace deployed before S-0017's portcullis fix must be torn down and redeployed: its first-admin invite was never redeemed, so golden-path step 6 answers 403 missing analytics:read"
kind: decision
sources: [S-0006, S-0017]
topics: [kluster, integration, portcullis, all]
paths: [integration/scripts/scenario-golden-path.sh, integration/README.md]
date: 2026-11-14
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0048 A story namespace deployed before S-0017's portcullis fix must be torn down and redeployed: its first-admin invite was never redeemed, so golden-path step 6 answers 403 missing analytics:read

S-0017 fixed portcullis so it sends tower the login's email, which lets the golden path redeem the tenant's first-admin invite (D-0042). A story namespace whose account was created before that fix keeps the unredeemed invite, so its admin never gets the roles the invite grants, however often it is deployed again.

S-0006 met this on `s-0006` after S-0017 landed. Its narrative's Decisions: "Tore down and redeployed `s-0006` before the passing run: its account predated S-0017's portcullis fix, so its first-admin invite was never redeemed and step 6 answered 403 missing analytics:read."

So when golden-path step 6 answers 403 for a missing `analytics:read` on a namespace that was first deployed before S-0017's acceptance (2026-11-14), ask flai serve for a teardown and then a deploy (`kluster_teardown`, `kluster_deploy`, D-0026), not a redeploy alone. The stories in progress across that date, S-0007, S-0008, and S-0010 among them, may have such a namespace.

Source: S-0006, S-0017.

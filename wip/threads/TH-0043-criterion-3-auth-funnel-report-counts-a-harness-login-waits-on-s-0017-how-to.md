---
id: TH-0043
title: "Criterion 3 (auth-funnel report counts a harness login) waits on S-0017: how to close it?"
anchor:
  path: wip/kanban/stories/S-0010-portcullis-emits-authentication-events-to-lookout.md
  item: S-0010
status: open
participants: [agent-S-0010]
created: 2026-11-10T04:57:15Z
updated: 2026-11-10T04:57:15Z
---

# TH-0043 Criterion 3 (auth-funnel report counts a harness login) waits on S-0017: how to close it?

On wip/kanban/stories/S-0010-portcullis-emits-authentication-events-to-lookout.md.

## Entries

### 2026-11-10T04:57:15Z agent-S-0010
S-0010's criterion 3 says chronicle's auth-funnel report returns non-zero counts for a login driven through the integration harness. Today that can't be checked. Two reasons:

1. Golden-path step 6 cannot read the report. Chronicle accepts only a portcullis-forwarded ES256 token, and the harness cannot serve the tenant's JWKS in-cluster (I-0007, D-0019). S-0017 (backlog) adds that read.
2. No local kluster runs here. The only kubectl context is a remote cluster (`linode-bpx-ctx`), and I won't touch it.

Recommendation, A: T-0052 removes step 6's synthetic `auth.login-succeeded` post, adds `lookoutUpstream` to the harness config, and checks the funnel events the real Dex login sends by querying chronicle's ClickHouse with `kubectl exec`, the same way the herald step queries Postgres. The report read stays with S-0017. Criterion 3 stays unticked, with the reason in the story's notes. You run the golden path on a local cluster at acceptance, or S-0017 closes it.

B: Reword criterion 3 to "the golden path's real login lands `auth.*` events in chronicle's store". T-0052 does the same as A, and the criterion is ticked once a local cluster run passes.

C: Leave the harness alone, cancel T-0052, and move criterion 3 to S-0017.

The Rust emitter, the lookout validation, and the docs don't wait on this answer. I'm going on with them now.

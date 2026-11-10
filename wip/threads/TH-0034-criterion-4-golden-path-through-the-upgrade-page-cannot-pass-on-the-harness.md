---
id: TH-0034
title: "Criterion 4 (golden path through the upgrade page) cannot pass on the harness today: how to close it?"
anchor:
  path: wip/kanban/stories/S-0007-hosted-upgrade-page-that-starts-a-stripe-checkout.md
  item: S-0007
status: open
participants: [agent-S-0007]
created: 2026-11-09T20:45:58Z
updated: 2026-11-09T20:45:58Z
---

# TH-0034 Criterion 4 (golden path through the upgrade page) cannot pass on the harness today: how to close it?

On wip/kanban/stories/S-0007-hosted-upgrade-page-that-starts-a-stripe-checkout.md.

## Entries

### 2026-11-09T20:45:58Z agent-S-0007
Criterion 4 asks the golden path to go through web's upgrade page against Stripe test mode. Two gaps stop it in the harness today. T-0066 cannot close either one.

1. **Web cannot check portcullis's token in-cluster.** `integration/config/authstar/web.yaml` points `internalJwtJwksUrl` at `https://admin.acme.authstar.app/.well-known/jwks.json`, which does not resolve in-cluster. This is the gap I-0007 records. S-0017 fixes it for chronicle, and S-0017 is still a backlog draft (D-0019).
2. **The harness has no real Stripe test key.** `integration/scripts/lib-secrets.sh:106` sets `stripe-secret-key-acme` to `sk_test_51Placeholder…`. It starts with `sk_test_`, so the planned "skip without a test key" check would not skip. Stripe would refuse the key, and keep's checkout-sessions call would fail.

**Recommended: A.** T-0066 writes the upgrade step and provisions an active plan mapping. The step skips with a message when web refuses the token (gap 1) or when the key is the placeholder (gap 2), and `integration/README.md` names both gaps. Criterion 4 stays unticked, with the reason in S-0007's notes. S-0017 is widened to cover web's JWKS (or a sibling story is opened for it), and you supply a real test key when you want the step to run.

**B.** Widen S-0007 to fix the in-cluster JWKS for web: TLS front, CoreDNS rewrite, and CA trust. TH-0021 sized this at about a story of work that only a live cluster proves, and turned it down for S-0009.

**C.** Drop criterion 4 from S-0007 and move it to a new story that waits for S-0017.

Until you answer, I am working the other tasks (T-0051, T-0055, T-0057, T-0061, T-0071).

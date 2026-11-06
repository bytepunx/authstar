---
id: TH-0023
title: "Plan for S-0007: six tasks in three layers"
anchor:
  path: wip/kanban/stories/S-0007-hosted-upgrade-page-that-starts-a-stripe-checkout.md
  item: S-0007
status: open
participants: [planner-S-0007]
created: 2026-11-06T18:10:54Z
updated: 2026-11-06T18:11:49Z
---

# TH-0023 Plan for S-0007: six tasks in three layers

On wip/kanban/stories/S-0007-hosted-upgrade-page-that-starts-a-stripe-checkout.md.

## Entries

### 2026-11-06T18:10:54Z planner-S-0007
S-0007 now has six tasks in three layers, 25 file touches, and an 8h forecast. The cost of delay waits on TH-0014.

No thread named "asked" exists, and S-0007 had no earlier plan, so this is its first.

## Layers

| Layer | Task | Waits for | Component |
|-------|------|-----------|-----------|
| 1 | T-0051 Keep lets an account of the tenant list its active plan mappings (with an ADR) | none | keep |
| 1 | T-0055 Portcullis proxies /_authstar/upgrade and its pages to web behind the auth gate | none | portcullis |
| 1 | T-0057 Web's keep client creates a checkout session, and the fake does too | none | web |
| 2 | T-0061 Web serves /_authstar/upgrade, sends the chosen plan to Stripe, and confirms the return | T-0057 | web |
| 3 | T-0066 Golden path starts a test-mode checkout and delivers checkout.session.completed | T-0051, T-0055, T-0061 | integration |
| 3 | T-0071 Users' docs describe the upgrade flow, and the design says the page exists | T-0051, T-0061 | docs, design |

## Scope the story did not name

Two gaps, both found in the code, are planned as tasks. Say if either belongs in its own story instead.

1. T-0055: portcullis does not proxy `/_authstar/upgrade` to web yet. It reads no `webUpstream`. Without this the page cannot be reached. The task covers only the upgrade paths. `/oauth2/select` and `/_authstar/link/confirm` (`design/stories/proxy/023-branded-page-proxying.md`) stay out. If you would rather have all of Story 023 done once, I recommend a separate story for it, which this one would then name in `after`.
2. T-0051: keep's `GET /tenants/{slug}/plan-mappings` requires `billing:manage`, so a plain account cannot list the plans. Recommended: any caller of that tenant may list `status=active`. Every other read and every write stays gated. It is recorded in a new ADR. The alternative is a page only billing managers can use, which defeats the self-service checkout keep already allows.

## Assumptions

- Price details come from the plan mappings keep already returns (`unitAmount`, `currency`, `interval`). The story therefore names no `after` on S-0008.
- Web builds `successUrl` and `cancelUrl` from the request's own origin. Keep passes them to Stripe unchecked. Making keep check the origin is a possible hardening, not planned here.
- The scope is always `{ account: accountId }`. Upgrading an organization is not planned.
- Paying on Stripe's hosted page needs a browser. So the golden path creates a real test-mode session through the page, then delivers a signed `checkout.session.completed` for that session. It skips with a message when the integration secret is not an `sk_test_` key. I have not checked whether the secret holds one.
- S-0006 and S-0008 change some of the same files. They set no order, because a trial merge judges the overlap.

### 2026-11-06T18:11:49Z planner-S-0007
One more risk, to criterion 4 (T-0066).

In the integration harness, web checks portcullis's token against `https://admin.acme.authstar.app/.well-known/jwks.json` (`integration/config/authstar/web.yaml`). That file says the URL does not resolve in-cluster. This is the same gap as I-0007, which TH-0021 raises for S-0009's chronicle step.

Until that gap is fixed, the golden path cannot pass through web's upgrade page. Recommended: if TH-0021 makes the harness fix its own story, S-0007 names that story in `after`, because T-0066 needs its in-cluster JWKS. Otherwise S-0007 goes to review with criterion 4 unticked. I have noted this in T-0066.

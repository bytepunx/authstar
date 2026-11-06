---
id: TH-0027
title: "S-0008 criterion 3: the live test needs a Stripe test-mode key this environment lacks"
anchor:
  path: wip/kanban/stories/S-0008-plan-mapping-editor-picks-from-the-tenant-s-live-stripe-prices.md
  item: S-0008
status: open
participants: [agent-S-0008]
created: 2026-11-06T18:27:37Z
updated: 2026-11-06T18:27:37Z
---

# TH-0027 S-0008 criterion 3: the live test needs a Stripe test-mode key this environment lacks

On wip/kanban/stories/S-0008-plan-mapping-editor-picks-from-the-tenant-s-live-stripe-prices.md.

## Entries

### 2026-11-06T18:27:37Z agent-S-0008
S-0008's criteria 1 and 2 are verified and ticked. The keep and web tests pass through `flai test` on the merged tiers, and web's svelte-check is clean. Criterion 3 has two halves:
- the fake half passes, in `keep/spec/behavior/stripe-prices.spec.ts`;
- the live half is written but has never run. The case in `keep/spec/live/stripe-live.spec.ts` needs `STRIPE_LIVE_TEST_SECRET_KEY`, and there is no Stripe test-mode key here.

Recommended: you run the live suite once, with your test-mode key, in S-0008's worktree:

```sh
cd /home/alex/git/bytepunx/authstar/.flai-cache/worktrees/S-0008/keep
STRIPE_LIVE_TEST_SECRET_KEY=sk_test_... npm run test:live
```

The case creates a test-mode product and a $15/month price, checks keep's route lists them, archives the price, and checks it drops out. It cleans up after itself. Tell me whether it passed. If it did, I tick criterion 3 and move S-0008 to review.

Other answers:
- Put the key in my environment, and I run that command myself and report the result.
- Accept S-0008 into review with criterion 3 unticked and the live half unverified, as the story's Verification notes say.

Meanwhile I am running the close-out, so S-0008 is otherwise ready.

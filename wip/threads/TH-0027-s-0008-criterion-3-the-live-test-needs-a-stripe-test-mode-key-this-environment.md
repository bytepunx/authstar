---
id: TH-0027
title: "S-0008 criterion 3: the live test needs a Stripe test-mode key this environment lacks"
anchor:
  path: wip/kanban/stories/S-0008-plan-mapping-editor-picks-from-the-tenant-s-live-stripe-prices.md
  item: S-0008
status: resolved
participants: [agent-S-0008, bytepunx]
created: 2026-11-06T18:27:37Z
updated: 2026-11-09T07:01:47Z
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

### 2026-11-09T06:59:51Z bytepunx
the key is set in the environment but when I run the test script I see 1 skipped test file with 12 skipped tests

### 2026-11-09T07:01:01Z agent-S-0008
Found it, and S-0008's live case passes. Your shell sets `STRIPE_LIVE_TEST_SECRET_KEY` but doesn't export it, so npm and vitest never see it and every test skips. Run `export STRIPE_LIVE_TEST_SECRET_KEY` once, or prefix the command with `STRIPE_LIVE_TEST_SECRET_KEY="$STRIPE_LIVE_TEST_SECRET_KEY"`.

With the key exported, the suite passed 11 of 12:
- `listActivePrices (GET /stripe-prices)` passed in 505ms. It created a real price, saw it listed with the right fields, archived it, and saw it drop out.
- One test failed: the existing Billing Portal case (`expected 403 to be 201`). Its token predates ADR 0100, which made the route check organization memberships. S-0008 changed neither that route nor that test, so I recorded it as I-0011 and left it.

I ticked criterion 3. S-0008 goes to review once the close-out passes again.

### 2026-11-09T07:01:47Z bytepunx
Resolved.

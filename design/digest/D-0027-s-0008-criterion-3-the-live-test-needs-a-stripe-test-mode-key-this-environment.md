---
id: D-0027
title: "S-0008 criterion 3: the live test needs a Stripe test-mode key this environment lacks: the key is set in the environment but when I run the test script I see 1 skipped test file with 12 skipped tests"
kind: answer
sources: [TH-0027, S-0005, T-0084]
topics: [billing, keep, testing, node]
paths: [keep/spec/live/stripe-live.spec.ts, keep/TESTING.md]
date: 2026-11-09
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0027 S-0008 criterion 3: the live test needs a Stripe test-mode key this environment lacks: the key is set in the environment but when I run the test script I see 1 skipped test file with 12 skipped tests

**Fact:** keep's live Stripe suite (`npm run test:live` in `keep`) reads `STRIPE_LIVE_TEST_SECRET_KEY` from the environment. A shell that sets the variable without exporting it hides it from npm and vitest, so the whole suite skips: 1 skipped file, 12 skipped tests. Export it first, with `export STRIPE_LIVE_TEST_SECRET_KEY`, or prefix the command with `STRIPE_LIVE_TEST_SECRET_KEY="$STRIPE_LIVE_TEST_SECRET_KEY"`. The operator holds the test-mode key in their own shell environment. It is not in the repository.

On TH-0027, S-0008's agent asked the operator to run the live half of S-0008's criterion 3. The operator answered on 2026-11-09: "the key is set in the environment but when I run the test script I see 1 skipped test file with 12 skipped tests". The agent found that the variable was not exported. With it exported, 11 of 12 tests passed, `listActivePrices (GET /stripe-prices)` among them.

The one failure was the Billing Portal case (`expected 403 to be 201`). Its token predated ADR 0100's organization-membership check. S-0008's agent recorded it as I-0011 on S-0008's branch. S-0005's T-0084 fixed it: the case now sends the organization membership `requireOrganizationAccess` checks, and S-0005's narrative records that "all 13 live tests pass". The fix is on main since S-0005's acceptance (f2d78e2, `keep/spec/live/stripe-live.spec.ts`). I-0011 is to be closed naming that fix, at S-0008's sync if S-0008 lands second.

Source: TH-0027, S-0005, T-0084.

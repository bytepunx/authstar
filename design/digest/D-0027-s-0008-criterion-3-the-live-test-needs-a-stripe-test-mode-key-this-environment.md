---
id: D-0027
title: "S-0008 criterion 3: the live test needs a Stripe test-mode key this environment lacks: the key is set in the environment but when I run the test script I see 1 skipped test file with 12 skipped tests"
kind: answer
sources: [TH-0027]
topics: [billing, keep, node, web, sveltekit, code, all]
paths: [design/adrs/0110-keep-lists-a-tenant-s-active-stripe-prices-at-get-tenants-tenantslug-stripe.md, design/adrs/README.md, design/system/overview.md, keep/src/lib/stripe-client.ts, keep/spec/lib/fake-stripe-client.ts, keep/src/routes/stripe-prices.ts, keep/src/lib/build-app.ts, keep/spec/behavior/stripe-prices.spec.ts, keep/TESTING.md, keep/spec/live/stripe-live.spec.ts, web/src/lib/server/clients/keep.ts, web/spec/fixtures/fake-keep-client.ts, web/src/routes/(admin)/billing/plan-mappings/new/+page.server.ts, web/src/routes/(admin)/billing/plan-mappings/new/+page.svelte, web/spec/behavior/billing-plan-mappings.spec.ts, docs/users/index.md, design/issues/I-0003-s-0002-was-accepted-and-archived-but-its-ci-and-test-tier-commits-never-reached.md, design/issues/summary.md, design/issues/I-0005-keep-s-permission-check-does-not-compare-the-token-s-tenant-with-the-route-s.md, design/issues/I-0004-accepted-stories-code-does-not-reach-main-s-0002-and-s-0004-were-archived-but.md, design/issues/I-0008-s-0002-was-accepted-and-archived-but-its-ci-and-test-tier-commits-never-reached.md, design/issues/I-0009-no-test-tier-type-checks-web-or-steward-scripts-test-sh-runs-vitest-only-never.md]
date: 2026-11-09
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0027 S-0008 criterion 3: the live test needs a Stripe test-mode key this environment lacks: the key is set in the environment but when I run the test script I see 1 skipped test file with 12 skipped tests

The operator, bytepunx, answered TH-0027 at 2026-11-09T06:59:51Z.

What was asked:

```text
S-0008's criteria 1 and 2 are verified and ticked. The keep and web tests pass through `flai test` on the merged tiers, and web's svelte-check is clean. Criterion 3 has two halves:
- the fake half passes, in `keep/spec/behavior/stripe-prices.spec.ts`;
- the live half is written but has never run. The case in `keep/spec/live/stripe-live.spec.ts` needs `STRIPE_LIVE_TEST_SECRET_KEY`, and there is no Stripe test-mode key here.
```

The answer:

```text
the key is set in the environment but when I run the test script I see 1 skipped test file with 12 skipped tests
```

Source: TH-0027.

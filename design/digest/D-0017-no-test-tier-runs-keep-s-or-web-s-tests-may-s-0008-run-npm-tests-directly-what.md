---
id: D-0017
title: "No test tier runs keep's or web's tests: may S-0008 run npm tests directly: What command should I run to Merge story/S-0002 into main first (yours to do)?"
kind: answer
sources: [TH-0009]
topics: [billing, keep, node, web, sveltekit, code, all]
paths: [design/adrs/0110-keep-lists-a-tenant-s-active-stripe-prices-at-get-tenants-tenantslug-stripe.md, design/adrs/README.md, design/system/overview.md, keep/src/lib/stripe-client.ts, keep/spec/lib/fake-stripe-client.ts, keep/src/routes/stripe-prices.ts, keep/src/lib/build-app.ts, keep/spec/behavior/stripe-prices.spec.ts, keep/TESTING.md, keep/spec/live/stripe-live.spec.ts, web/src/lib/server/clients/keep.ts, web/spec/fixtures/fake-keep-client.ts, web/src/routes/(admin)/billing/plan-mappings/new/+page.server.ts, web/src/routes/(admin)/billing/plan-mappings/new/+page.svelte, web/spec/behavior/billing-plan-mappings.spec.ts, docs/users/index.md, design/issues/I-0003-s-0002-was-accepted-and-archived-but-its-ci-and-test-tier-commits-never-reached.md, design/issues/summary.md, design/issues/I-0005-keep-s-permission-check-does-not-compare-the-token-s-tenant-with-the-route-s.md, design/issues/I-0004-accepted-stories-code-does-not-reach-main-s-0002-and-s-0004-were-archived-but.md]
date: 2026-11-06
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0017 No test tier runs keep's or web's tests: may S-0008 run npm tests directly: What command should I run to Merge story/S-0002 into main first (yours to do)?

The operator, bytepunx, answered TH-0009 at 2026-11-06T18:03:45Z.

What was asked:

```text
`flai test` and the close-out cannot test S-0008's code. On main, `scripts/test.sh` is still the template placeholder and `system-flow.yaml` declares no test tiers. S-0002's commit 1b28770, which wired real tiers, is only on story/S-0002: its acceptance archived the story without merging the branch. I recorded this as I-0003. No component has `node_modules` either.
```

The answer:

```text
What command should I run to Merge story/S-0002 into main first (yours to do)?
```

The operator, bytepunx, answered TH-0009 again at 2026-11-06T18:16:36Z.

The answer:

```text
done
```

Source: TH-0009.

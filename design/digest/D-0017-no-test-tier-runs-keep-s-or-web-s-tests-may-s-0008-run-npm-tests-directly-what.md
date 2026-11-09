---
id: D-0017
title: "No test tier runs keep's or web's tests: may S-0008 run npm tests directly: What command should I run to Merge story/S-0002 into main first (yours to do)?"
kind: answer
sources: [TH-0009, TH-0010, TH-0012, S-0009]
topics: [billing, keep, node, web, sveltekit, code, all, testing, chronicle, steward]
paths: [design/adrs/0110-keep-lists-a-tenant-s-active-stripe-prices-at-get-tenants-tenantslug-stripe.md, design/adrs/README.md, design/system/overview.md, keep/src/lib/stripe-client.ts, keep/spec/lib/fake-stripe-client.ts, keep/src/routes/stripe-prices.ts, keep/src/lib/build-app.ts, keep/spec/behavior/stripe-prices.spec.ts, keep/TESTING.md, keep/spec/live/stripe-live.spec.ts, web/src/lib/server/clients/keep.ts, web/spec/fixtures/fake-keep-client.ts, web/src/routes/(admin)/billing/plan-mappings/new/+page.server.ts, web/src/routes/(admin)/billing/plan-mappings/new/+page.svelte, web/spec/behavior/billing-plan-mappings.spec.ts, docs/users/index.md, design/issues/I-0003-s-0002-was-accepted-and-archived-but-its-ci-and-test-tier-commits-never-reached.md, design/issues/summary.md, design/issues/I-0005-keep-s-permission-check-does-not-compare-the-token-s-tenant-with-the-route-s.md, design/issues/I-0004-accepted-stories-code-does-not-reach-main-s-0002-and-s-0004-were-archived-but.md]
date: 2026-11-06
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0017 No test tier runs keep's or web's tests: may S-0008 run npm tests directly: What command should I run to Merge story/S-0002 into main first (yours to do)?

The operator merged `story/S-0002` and `story/S-0004` into `main` (5263a88 and af55c04, 2026-11-06), so `main` has S-0002's `scripts/test.sh` and test tiers. A story's agent tests its code with `flai test` and the close-out, after `make install` in its worktree, not with `npm` or vitest by hand.

TH-0009 (S-0008) and TH-0012 (S-0009) both asked for leave to run `npm test` directly, because `scripts/test.sh` on `main` was still the template placeholder and S-0002's acceptance had archived it without merging its branch (I-0004). The other answer offered was "Merge story/S-0002 into main first (yours to do)".

The operator asked at 2026-11-06T18:03:45Z: "What command should I run to Merge story/S-0002 into main first (yours to do)?", and answered at 18:16:36Z: "done". On TH-0010 (S-0011's plan) at 18:17:25Z: "I merged in S-0002 and 0004, check to see if the test scripts address this". S-0009's agent then synced, ran `flai test` on `chronicle/`, and resolved TH-0012 as moot.

The tier still runs every project's suite whatever the paths (I-0010).

Source: TH-0009, TH-0010, TH-0012, S-0009.

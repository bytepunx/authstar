---
id: D-0028
title: "npm 12 blocks farmhash's build, so S-0008's close-out can't pass: approve the install scripts: running that command fails across all projects"
kind: answer
sources: [TH-0030]
topics: [billing, keep, node, web, sveltekit, code, all]
paths: [design/adrs/0110-keep-lists-a-tenant-s-active-stripe-prices-at-get-tenants-tenantslug-stripe.md, design/adrs/README.md, design/system/overview.md, keep/src/lib/stripe-client.ts, keep/spec/lib/fake-stripe-client.ts, keep/src/routes/stripe-prices.ts, keep/src/lib/build-app.ts, keep/spec/behavior/stripe-prices.spec.ts, keep/TESTING.md, keep/spec/live/stripe-live.spec.ts, web/src/lib/server/clients/keep.ts, web/spec/fixtures/fake-keep-client.ts, web/src/routes/(admin)/billing/plan-mappings/new/+page.server.ts, web/src/routes/(admin)/billing/plan-mappings/new/+page.svelte, web/spec/behavior/billing-plan-mappings.spec.ts, docs/users/index.md, design/issues/I-0003-s-0002-was-accepted-and-archived-but-its-ci-and-test-tier-commits-never-reached.md, design/issues/summary.md, design/issues/I-0005-keep-s-permission-check-does-not-compare-the-token-s-tenant-with-the-route-s.md, design/issues/I-0004-accepted-stories-code-does-not-reach-main-s-0002-and-s-0004-were-archived-but.md, design/issues/I-0008-s-0002-was-accepted-and-archived-but-its-ci-and-test-tier-commits-never-reached.md, design/issues/I-0009-no-test-tier-type-checks-web-or-steward-scripts-test-sh-runs-vitest-only-never.md, design/issues/I-0011-keep-s-live-portal-session-test-sends-a-pre-adr-0100-token-and-gets-403.md, design/issues/I-0013-npm-12-blocks-dependency-install-scripts-so-farmhash-is-never-built-and-herald.md]
date: 2026-11-09
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0028 npm 12 blocks farmhash's build, so S-0008's close-out can't pass: approve the install scripts: running that command fails across all projects

The operator, bytepunx, answered TH-0030 at 2026-11-09T07:40:26Z.

What was asked:

```text
All three of S-0008's criteria are verified and ticked, and the live test passed. The close-out still can't pass, for a reason outside S-0008's code.
```

The answer:

```text
running that command fails across all projects
```

Source: TH-0030.

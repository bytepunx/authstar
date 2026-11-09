---
id: D-0022
title: "Cost of delay inputs for S-0007: done"
kind: answer
sources: [TH-0014]
topics: [billing, integration, shell, keep, node, portcullis, rust, web, sveltekit, code, all]
paths: [keep/src/routes/plan-mappings.ts, keep/spec/behavior/plan-mappings.spec.ts, design/adrs/README.md, portcullis/crates/authstar-middleware/src/upgrade.rs, portcullis/crates/authstar-middleware/src/lib.rs, portcullis/crates/authstar-proxy/src/main.rs, portcullis/crates/authstar-middleware/tests/integration_tests.rs, portcullis/TESTING.md, web/src/lib/server/clients/keep.ts, web/spec/fixtures/fake-keep-client.ts, web/src/routes/(hosted)/_authstar/upgrade/+page.server.ts, web/src/routes/(hosted)/_authstar/upgrade/+page.svelte, web/src/routes/(hosted)/_authstar/upgrade/success/+page.svelte, web/src/routes/(hosted)/_authstar/upgrade/cancelled/+page.svelte, web/spec/behavior/hosted-upgrade.spec.ts, web/e2e/hosted-upgrade.spec.ts, web/TESTING.md, integration/scripts/scenario-golden-path.sh, integration/scripts/provision.sh, integration/README.md, docs/users/index.md, design/system/overview.md, design/stories/web/010-hosted-pages.md, design/stories/web/005-billing.md, design/stories/keep/002-stripe-webhook-handling.md]
date: 2026-11-06
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0022 Cost of delay inputs for S-0007: done

The operator took the planner's recommended cost of delay inputs for S-0007 and set them on the story: `revenue_per_week` 0, `penalty_per_week` 0, no `time_lost_per_cycle` (set by alex at 2026-11-06T18:21:07Z). Its value is 0 USD a week.

The planner's reason, on TH-0014: loci already bills through its own Stripe integration and moves onto keep, so the hosted upgrade page brings no new revenue.

The operator answered at 2026-11-06T18:21:13Z: "done". As with S-0008 (D-0014), the inputs went on the story, not on E-0002.

Source: TH-0014.

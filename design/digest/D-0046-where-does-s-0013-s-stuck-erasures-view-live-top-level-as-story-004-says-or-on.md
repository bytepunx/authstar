---
id: D-0046
title: "Where does S-0013's Stuck Erasures view live: top-level as story 004 says, or on the tenant page: S-0013 is in progress"
kind: answer
sources: [TH-0016, S-0013]
topics: [steward, sveltekit, code, all]
paths: [steward/src/lib/server/tower-client.ts, steward/src/lib/types.ts, steward/tests/helpers/fake-backend-server.ts, steward/tests/integration/api-wire.integration.spec.ts, "steward/src/routes/api/tenants/[slug]/activity/+server.ts", steward/tests/behavior/activity.spec.ts, steward/src/routes/api/erasure-requests/stuck/+server.ts, steward/tests/behavior/stuck-erasure-requests.spec.ts, "steward/src/routes/tenants/[slug]/+page.svelte", steward/tests/e2e/tenant-activity.spec.ts, steward/TESTING.md, design/stories/steward/004-activity-and-stuck-erasure-requests.md, design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md, design/issues/summary.md]
date: 2026-11-14
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0046 Where does S-0013's Stuck Erasures view live: top-level as story 004 says, or on the tenant page: S-0013 is in progress

Steward's Stuck Erasures view is built both ways: a top-level `/erasure-requests/stuck` view, as `design/stories/steward/004-activity-and-stuck-erasure-requests.md` specifies, and a Stuck Erasures section on `/tenants/[slug]`, as S-0013's criterion 1 says. This is answer C on TH-0016, which the operator confirmed.

The planner of S-0013 asked on TH-0016 because the story's criterion 1 put the section on `/tenants/[slug]`, while story 004 says the view is "**not** reached from within a single tenant's operator context". Tower's `GET /operator/erasure-requests/stuck` is cross-tenant.

S-0013's agent recommended C on 2026-11-09T20:45:33Z: "Build the top-level `/erasure-requests/stuck` view that story 004 specifies, with the threshold input (default 72) and rows grouped by missing service. Also add a Stuck Erasures section on `/tenants/[slug]` that shows tower's list filtered to that tenant, at 72 hours." Its reason: C meets criterion 1 as written, so the finalized story needs no rewording, and it still delivers the cross-tenant view the design asks for. The tenant section reuses T-0046's proxy and the same row markup.

The operator, bytepunx, answered at 2026-11-14T09:55:31Z: "Confirmed the recommendation of 2026-11-09T20:45:33Z agent-S-0013." The rejected answers were A, the top-level view alone with criterion 1 reworded, and B, the tenant section alone with story 004 changed to match.

Source: TH-0016, S-0013.

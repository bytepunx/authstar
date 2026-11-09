---
id: D-0015
title: "Cost of delay inputs for S-0011: done"
kind: answer
sources: [TH-0004]
topics: [steward, sveltekit, web, code, all]
paths: [web/src/lib/permissions.ts, web/spec/behavior/permissions.spec.ts, web/spec/behavior/admin-layout.spec.ts, web/spec/components/nav.spec.ts, design/stories/web/001-app-shell-auth-and-section-gating.md, web/src/routes/+error.svelte, web/spec/components/error-page.spec.ts, steward/src/routes/+error.svelte, steward/tests/e2e/error-page.spec.ts, web/src/lib/server/upstream-error.ts, web/spec/behavior/upstream-error.spec.ts, web/src/routes/(admin)/applications/+page.server.ts, web/src/routes/(admin)/applications/new/+page.server.ts, "web/src/routes/(admin)/applications/[slug]/+page.server.ts", web/src/routes/(admin)/billing/organizations/+page.server.ts, "web/src/routes/(admin)/billing/organizations/[organizationId]/+page.server.ts", web/src/routes/(admin)/billing/plan-mappings/+page.server.ts, web/src/routes/(admin)/billing/plan-mappings/new/+page.server.ts, "web/src/routes/(admin)/billing/plan-mappings/[id]/+page.server.ts", web/src/routes/(admin)/billing/stripe-config/+page.server.ts, web/spec/behavior/applications-list.spec.ts, web/spec/behavior/applications-edit.spec.ts, web/spec/behavior/organizations-list.spec.ts, web/spec/behavior/organizations-detail.spec.ts, web/spec/behavior/billing-plan-mappings.spec.ts, web/spec/behavior/billing-stripe-config.spec.ts, web/spec/fixtures/fake-tower-client.ts, web/spec/fixtures/fake-keep-client.ts, "web/src/routes/(embed)/applications/[applicationSlug]/api-keys/+page.server.ts", "web/src/routes/(embed)/organizations/[organizationId]/+page.server.ts", "web/src/routes/(embed)/organizations/[organizationId]/applications/[applicationSlug]/api-keys/+page.server.ts", web/spec/behavior/embed-application-api-keys.spec.ts, web/spec/behavior/embed-organization.spec.ts, web/spec/behavior/embed-organization-api-keys.spec.ts, web/src/lib/components/SubmitButton.svelte, web/spec/components/submit-button.spec.ts, web/src/routes/(admin)/applications/new/+page.svelte, "web/src/routes/(admin)/applications/[slug]/+page.svelte", "web/src/routes/(admin)/billing/organizations/[organizationId]/+page.svelte", web/src/routes/(admin)/billing/plan-mappings/new/+page.svelte, "web/src/routes/(admin)/billing/plan-mappings/[id]/+page.svelte", web/src/routes/(admin)/billing/stripe-config/+page.svelte, "web/src/routes/(embed)/applications/[applicationSlug]/api-keys/+page.svelte", "web/src/routes/(embed)/organizations/[organizationId]/+page.svelte", "web/src/routes/(embed)/organizations/[organizationId]/applications/[applicationSlug]/api-keys/+page.svelte", web/src/routes/(hosted)/signup/+page.svelte, web/e2e/admin-nav-and-errors.spec.ts, web/e2e/fixtures/auth.ts]
date: 2026-11-06
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0015 Cost of delay inputs for S-0011: done

The operator set S-0011's cost of delay inputs on its epic E-0004, as the planner recommended, so that S-0012 and S-0013 share them: `revenue_per_week` 0, `penalty_per_week` 100, no `time_lost_per_cycle` (set by alex at 2026-11-06T18:00:17Z).

The planner's reason, on TH-0004: a remediation with no revenue of its own, but "five of web's eight nav links 404 today, every load failure shows SvelteKit's bare 500, and forms give no feedback while they post; that costs tenant admins' trust and support time each week".

The operator answered at 2026-11-06T18:00:24Z: "done". A later E-0004 story takes its share from the epic and needs no inputs of its own.

Source: TH-0004.

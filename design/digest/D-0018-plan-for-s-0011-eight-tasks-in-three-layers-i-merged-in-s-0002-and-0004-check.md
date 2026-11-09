---
id: D-0018
title: "Plan for S-0011: eight tasks in three layers: I merged in S-0002 and 0004, check to see if the test scripts address this"
kind: answer
sources: [TH-0010]
topics: [steward, sveltekit, web, code, all]
paths: [web/src/lib/permissions.ts, web/spec/behavior/permissions.spec.ts, web/spec/behavior/admin-layout.spec.ts, web/spec/components/nav.spec.ts, design/stories/web/001-app-shell-auth-and-section-gating.md, web/src/routes/+error.svelte, web/spec/components/error-page.spec.ts, steward/src/routes/+error.svelte, steward/tests/e2e/error-page.spec.ts, web/src/lib/server/upstream-error.ts, web/spec/behavior/upstream-error.spec.ts, web/src/routes/(admin)/applications/+page.server.ts, web/src/routes/(admin)/applications/new/+page.server.ts, "web/src/routes/(admin)/applications/[slug]/+page.server.ts", web/src/routes/(admin)/billing/organizations/+page.server.ts, "web/src/routes/(admin)/billing/organizations/[organizationId]/+page.server.ts", web/src/routes/(admin)/billing/plan-mappings/+page.server.ts, web/src/routes/(admin)/billing/plan-mappings/new/+page.server.ts, "web/src/routes/(admin)/billing/plan-mappings/[id]/+page.server.ts", web/src/routes/(admin)/billing/stripe-config/+page.server.ts, web/spec/behavior/applications-list.spec.ts, web/spec/behavior/applications-edit.spec.ts, web/spec/behavior/organizations-list.spec.ts, web/spec/behavior/organizations-detail.spec.ts, web/spec/behavior/billing-plan-mappings.spec.ts, web/spec/behavior/billing-stripe-config.spec.ts, web/spec/fixtures/fake-tower-client.ts, web/spec/fixtures/fake-keep-client.ts, "web/src/routes/(embed)/applications/[applicationSlug]/api-keys/+page.server.ts", "web/src/routes/(embed)/organizations/[organizationId]/+page.server.ts", "web/src/routes/(embed)/organizations/[organizationId]/applications/[applicationSlug]/api-keys/+page.server.ts", web/spec/behavior/embed-application-api-keys.spec.ts, web/spec/behavior/embed-organization.spec.ts, web/spec/behavior/embed-organization-api-keys.spec.ts, web/src/lib/components/SubmitButton.svelte, web/spec/components/submit-button.spec.ts, web/src/routes/(admin)/applications/new/+page.svelte, "web/src/routes/(admin)/applications/[slug]/+page.svelte", "web/src/routes/(admin)/billing/organizations/[organizationId]/+page.svelte", web/src/routes/(admin)/billing/plan-mappings/new/+page.svelte, "web/src/routes/(admin)/billing/plan-mappings/[id]/+page.svelte", web/src/routes/(admin)/billing/stripe-config/+page.svelte, "web/src/routes/(embed)/applications/[applicationSlug]/api-keys/+page.svelte", "web/src/routes/(embed)/organizations/[organizationId]/+page.svelte", "web/src/routes/(embed)/organizations/[organizationId]/applications/[applicationSlug]/api-keys/+page.svelte", web/src/routes/(hosted)/signup/+page.svelte, web/e2e/admin-nav-and-errors.spec.ts, web/e2e/fixtures/auth.ts]
date: 2026-11-06
status: active
absorbed_by: ""
asked_again: []
cited: [S-0011]
---

# D-0018 Plan for S-0011: eight tasks in three layers: I merged in S-0002 and 0004, check to see if the test scripts address this

The operator answered S-0011's plan on TH-0010 with the merge of S-0002 and S-0004 into `main`, not with a change to the plan: its eight tasks in three layers stand as the planner wrote them.

The plan's assumptions the answer left in place: web's section flag is a `built` constant on each `AdminSection`, not an environment variable; steward's error page is tested with Playwright because steward has no component-test setup; signup gets a pending state but not `use:enhance`; the `(embed)` layouts' 403 stays a 403; S-0011 is tagged `web`, and the form-pending work (T-0032, T-0033) was not split off.

The operator answered at 2026-11-06T18:17:25Z: "I merged in S-0002 and 0004, check to see if the test scripts address this". They do: D-0017 holds what the merge means for testing.

Source: TH-0010.

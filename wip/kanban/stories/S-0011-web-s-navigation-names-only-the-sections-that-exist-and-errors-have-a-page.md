---
id: S-0011
type: story
nature: remediation
title: Web's navigation names only the sections that exist and errors have a page
status: ready
parent: E-0004
owner: alex
created: 2026-10-21T05:13:43Z
updated: 2026-11-06T17:56:15Z
transitions:
  - to: ready
    at: 2026-10-21T05:13:56Z
    by: claude
tags: [web]
touches: [web/src/lib/permissions.ts, web/spec/behavior/permissions.spec.ts, web/spec/behavior/admin-layout.spec.ts, web/spec/components/nav.spec.ts, design/stories/web/001-app-shell-auth-and-section-gating.md, web/src/routes/+error.svelte, web/spec/components/error-page.spec.ts, steward/src/routes/+error.svelte, steward/tests/e2e/error-page.spec.ts, web/src/lib/server/upstream-error.ts, web/spec/behavior/upstream-error.spec.ts, web/src/routes/(admin)/applications/+page.server.ts, web/src/routes/(admin)/applications/new/+page.server.ts, "web/src/routes/(admin)/applications/[slug]/+page.server.ts", web/src/routes/(admin)/billing/organizations/+page.server.ts, "web/src/routes/(admin)/billing/organizations/[organizationId]/+page.server.ts", web/src/routes/(admin)/billing/plan-mappings/+page.server.ts, web/src/routes/(admin)/billing/plan-mappings/new/+page.server.ts, "web/src/routes/(admin)/billing/plan-mappings/[id]/+page.server.ts", web/src/routes/(admin)/billing/stripe-config/+page.server.ts, web/spec/behavior/applications-list.spec.ts, web/spec/behavior/applications-edit.spec.ts, web/spec/behavior/organizations-list.spec.ts, web/spec/behavior/organizations-detail.spec.ts, web/spec/behavior/billing-plan-mappings.spec.ts, web/spec/behavior/billing-stripe-config.spec.ts, web/spec/fixtures/fake-tower-client.ts, web/spec/fixtures/fake-keep-client.ts, "web/src/routes/(embed)/applications/[applicationSlug]/api-keys/+page.server.ts", "web/src/routes/(embed)/organizations/[organizationId]/+page.server.ts", "web/src/routes/(embed)/organizations/[organizationId]/applications/[applicationSlug]/api-keys/+page.server.ts", web/spec/behavior/embed-application-api-keys.spec.ts, web/spec/behavior/embed-organization.spec.ts, web/spec/behavior/embed-organization-api-keys.spec.ts, web/src/lib/components/SubmitButton.svelte, web/spec/components/submit-button.spec.ts, web/src/routes/(admin)/applications/new/+page.svelte, "web/src/routes/(admin)/applications/[slug]/+page.svelte", "web/src/routes/(admin)/billing/organizations/[organizationId]/+page.svelte", web/src/routes/(admin)/billing/plan-mappings/new/+page.svelte, "web/src/routes/(admin)/billing/plan-mappings/[id]/+page.svelte", web/src/routes/(admin)/billing/stripe-config/+page.svelte, "web/src/routes/(embed)/applications/[applicationSlug]/api-keys/+page.svelte", "web/src/routes/(embed)/organizations/[organizationId]/+page.svelte", "web/src/routes/(embed)/organizations/[organizationId]/applications/[applicationSlug]/api-keys/+page.svelte", web/src/routes/(hosted)/signup/+page.svelte, web/e2e/admin-nav-and-errors.spec.ts, web/e2e/fixtures/auth.ts]
usage:
  source: sum
  seconds: 0
  models: []
  strategic:
    - kind: planner
      seconds: 533
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 703
          output: 41094
          cache_read: 40492920
          cache_write: 599557
          cost: 13.8644
    - kind: orchestrator
      seconds: 33
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 23
          output: 168
          cache_read: 555518
          cache_write: 78429
          cost: 0.8839
forecast:
  duration: 5h
  delivery: 2026-11-07T03:48:00Z
  basis: "Its own forecast of 5h; 1st in the pull order with an in-progress limit of 2, behind S-0008 and S-0009."
  by: flai
  at: 2026-11-06T17:56:15Z
---
# S-0011 Web's navigation names only the sections that exist and errors have a page

## Goal

A tenant admin never clicks into a 404: web's nav lists only built sections, unbuilt ones are hidden behind a flag until their story lands, every route has an error page, and form submissions show a pending state.

## Acceptance criteria
- [ ] `web/src/lib/permissions.ts` sections without a route are not rendered in the nav
- [ ] `+error.svelte` exists at the root of web and steward with a plain message and a way back
- [ ] Web's forms use `use:enhance` with a pending state, and `load` failures from tower or keep show an error rather than SvelteKit's default 500
- [ ] Component and behavior tests cover the nav and error page

## Tasks
- T-0027 Nav and Overview list only the sections that have a route
- T-0028 Web has a root error page with a plain message and a way back
- T-0029 Admin loads and actions turn tower and keep failures into a handled error
- T-0030 Steward has a root error page with a plain message and a way back
- T-0031 Embed loads and actions turn tower and keep failures into a handled error
- T-0032 Admin forms submit with use:enhance and show a pending state
- T-0033 Embed forms and signup show a pending state
- T-0035 End-to-end check that the nav, error page, and upstream failures work together in web

## Notes

ADR-0049 fixes the eight-section information architecture; hiding is a presentation rule, not a change to it.

### Planning

Planned by planner-S-0011 on 2026-11-06.

The story declared no touches. Every touch names a file, and no folder touch is kept. Where each one came from:

| Touches | Source |
|---|---|
| `web/src/lib/permissions.ts` | declared in the first criterion |
| `web/src/routes/+error.svelte`, `steward/src/routes/+error.svelte` | the second criterion |
| `web/spec/components/nav.spec.ts`, `web/spec/behavior/permissions.spec.ts` | layout: the existing specs for the nav and `permissions.ts` (fourth criterion) |
| `web/spec/behavior/admin-layout.spec.ts`, `web/spec/components/error-page.spec.ts`, `steward/tests/e2e/error-page.spec.ts` | layout: new specs in the tiers `web/TESTING.md` and `steward/TESTING.md` set out |
| `design/stories/web/001-app-shell-auth-and-section-gating.md` | design: the section-gating story the hiding rule refines |
| the nine `(admin)` and three `(embed)` `+page.server.ts` files, `web/src/lib/server/upstream-error.ts` | layout: every load and action that calls tower or keep through `web/src/lib/server/clients/` (third criterion) |
| the spec beside each of those pages, `web/spec/behavior/upstream-error.spec.ts` | layout |
| `web/spec/behavior/organizations-detail.spec.ts`, `web/spec/fixtures/fake-tower-client.ts`, `web/spec/fixtures/fake-keep-client.ts` | co-change: `flai touches suggest` lists them with the clients and pages above, and the tests need the fakes to fail on demand |
| the ten `+page.svelte` files that hold a form, `web/src/lib/components/SubmitButton.svelte`, `web/spec/components/submit-button.spec.ts` | layout: every `<form>` under `web/src/routes` (third criterion) |
| `web/e2e/admin-nav-and-errors.spec.ts`, `web/e2e/fixtures/auth.ts` | layout: web's Playwright tier |

Decisions and assumptions:

- **Tag.** The story was tagged `web`, the component it delivers to. flai check needs a component tag once the story touches both web and steward. Steward's error page is an incidental, additive change.
- **No `after`.** No other story writes anything this one reads.
- **Overlap.** The plan-mapping and organization pages overlap the web billing pages that other open stories may touch. A trial merge judges that, not `after`.

Figures:

- **Forecast: 5h, adjusted from flai's 1h.** `flai forecast` had no done stories with usage and fell back to `planning.default_duration`, sized for 4 criteria and 0 touches. The plan has eight tasks in two layers over about 45 files. It covers two apps and four test tiers, and steward's e2e tier builds first. Delivery is 2026-11-09T17:00Z, since S-0008, S-0003, and S-0009 are ahead in the pull order with an in-progress limit of 2.
- **Cost of delay: not set.** Neither S-0011 nor E-0004 has inputs, so `flai cod S-0011` refuses. The inputs are asked for in TH-0004.

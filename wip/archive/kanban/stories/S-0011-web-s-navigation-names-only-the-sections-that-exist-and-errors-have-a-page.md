---
id: S-0011
type: story
nature: remediation
title: Web's navigation names only the sections that exist and errors have a page
status: done
parent: E-0004
owner: alex
created: 2026-10-21T05:13:43Z
updated: 2026-11-09T09:04:33Z
transitions:
  - to: ready
    at: 2026-10-21T05:13:56Z
    by: claude
  - to: in-progress
    at: 2026-11-09T07:03:32Z
    by: agent-S-0011
  - to: review
    at: 2026-11-09T08:08:18Z
    by: agent-S-0011
  - to: done
    at: 2026-11-09T09:04:33Z
    by: bytepunx
tags: [web]
touches: [web/src/lib/permissions.ts, web/spec/behavior/permissions.spec.ts, web/spec/behavior/admin-layout.spec.ts, web/spec/components/nav.spec.ts, design/stories/web/001-app-shell-auth-and-section-gating.md, web/src/routes/+error.svelte, web/spec/components/error-page.spec.ts, steward/src/routes/+error.svelte, steward/tests/e2e/error-page.spec.ts, web/src/lib/server/upstream-error.ts, web/spec/behavior/upstream-error.spec.ts, web/src/routes/(admin)/applications/+page.server.ts, web/src/routes/(admin)/applications/new/+page.server.ts, "web/src/routes/(admin)/applications/[slug]/+page.server.ts", web/src/routes/(admin)/billing/organizations/+page.server.ts, "web/src/routes/(admin)/billing/organizations/[organizationId]/+page.server.ts", web/src/routes/(admin)/billing/plan-mappings/+page.server.ts, web/src/routes/(admin)/billing/plan-mappings/new/+page.server.ts, "web/src/routes/(admin)/billing/plan-mappings/[id]/+page.server.ts", web/src/routes/(admin)/billing/stripe-config/+page.server.ts, web/spec/behavior/applications-list.spec.ts, web/spec/behavior/applications-edit.spec.ts, web/spec/behavior/organizations-list.spec.ts, web/spec/behavior/organizations-detail.spec.ts, web/spec/behavior/billing-plan-mappings.spec.ts, web/spec/behavior/billing-stripe-config.spec.ts, web/spec/fixtures/fake-tower-client.ts, web/spec/fixtures/fake-keep-client.ts, "web/src/routes/(embed)/applications/[applicationSlug]/api-keys/+page.server.ts", "web/src/routes/(embed)/organizations/[organizationId]/+page.server.ts", "web/src/routes/(embed)/organizations/[organizationId]/applications/[applicationSlug]/api-keys/+page.server.ts", web/spec/behavior/embed-application-api-keys.spec.ts, web/spec/behavior/embed-organization.spec.ts, web/spec/behavior/embed-organization-api-keys.spec.ts, web/src/lib/components/SubmitButton.svelte, web/spec/components/submit-button.spec.ts, web/src/routes/(admin)/applications/new/+page.svelte, "web/src/routes/(admin)/applications/[slug]/+page.svelte", "web/src/routes/(admin)/billing/organizations/[organizationId]/+page.svelte", web/src/routes/(admin)/billing/plan-mappings/new/+page.svelte, "web/src/routes/(admin)/billing/plan-mappings/[id]/+page.svelte", web/src/routes/(admin)/billing/stripe-config/+page.svelte, "web/src/routes/(embed)/applications/[applicationSlug]/api-keys/+page.svelte", "web/src/routes/(embed)/organizations/[organizationId]/+page.svelte", "web/src/routes/(embed)/organizations/[organizationId]/applications/[applicationSlug]/api-keys/+page.svelte", web/src/routes/(hosted)/signup/+page.svelte, web/e2e/admin-nav-and-errors.spec.ts, web/e2e/fixtures/auth.ts, design/issues/I-0016-npm-12-blocks-install-scripts-so-make-install-leaves-farmhash-unbuilt-and.md, design/issues/summary.md, design/issues/I-0017-web-s-playwright-e2e-specs-run-in-no-test-tier-so-flai-test-and-the-close-out.md, web/spec/fixtures/app-state.ts, web/vitest.components.config.ts, web/spec/fixtures/fake-tower-server.ts, design/issues/I-0018-herald-s-retention-purge-spec-fails-intermittently-with-ntp-clock-skew-detected.md]
usage:
  source: log
  seconds: 3900
  priced_by: harness
  turns:
    - day: 2026-11-09
      ceremony: 2
      test_runs: 1
      hand_edits: 2
      work: 76
  models:
    - model: claude-opus-5-5
      input: 346
      output: 105523
      cache_read: 32078202
      cache_write: 441342
      cost: 11.5166
  strategic:
    - kind: planner
      seconds: 940
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 945
          output: 61342
          cache_read: 59269593
          cache_write: 728897
          cost: 20.7006
    - kind: orchestrator
      seconds: 134
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 78
          output: 531
          cache_read: 2066793
          cache_write: 296315
          cost: 2.8812
cost_of_delay:
  value: 71.43
  by: planner-S-0011
  at: 2026-11-06T18:01:04Z
forecast:
  duration: 5h
  delivery: 2026-11-07T02:12:00Z
  basis: "Its own forecast of 5h; 1st in the pull order with an in-progress limit of 4, behind S-0006 and S-0008."
  by: flai
  at: 2026-11-06T21:11:49Z
---
# S-0011 Web's navigation names only the sections that exist and errors have a page

## Goal

A tenant admin never clicks into a 404: web's nav lists only built sections, unbuilt ones are hidden behind a flag until their story lands, every route has an error page, and form submissions show a pending state.

## Acceptance criteria
- [x] `web/src/lib/permissions.ts` sections without a route are not rendered in the nav
- [x] `+error.svelte` exists at the root of web and steward with a plain message and a way back
- [x] Web's forms use `use:enhance` with a pending state, and `load` failures from tower or keep show an error rather than SvelteKit's default 500
- [x] Component and behavior tests cover the nav and error page

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
- **Testing risk.** Per TH-0009 and I-0003, no test tier on main runs web's or steward's tests yet. The tasks' Done-when lines name `flai test` once the tiers are wired, and web's npm scripts until then.

Figures:

- **Forecast: 5h, adjusted from flai's 1h.** `flai forecast` had no done stories with usage and fell back to `planning.default_duration`, sized for 4 criteria and 0 touches. The plan has eight tasks in two layers over about 45 files. It covers two apps and four test tiers, and steward's e2e tier builds first. flai works out the delivery from the pull order and keeps it current.
- **Cost of delay: 71.43 USD a week, as `flai cod` gives it.** The operator set E-0004's inputs in TH-0004: revenue 0 and a penalty of 100 USD a week. `flai cod` splits that penalty by forecast. S-0011's 5h of the epic's 7h gives it 71.43. S-0012 and S-0013 still sit on the 1h default, which the split rewards S-0011 for, so the share could look generous. It stands anyway. The penalty the operator priced is the 404s, the bare 500s, and the forms with no feedback, and this story removes most of it. S-0012 and S-0013 add new screens rather than remove a penalty.

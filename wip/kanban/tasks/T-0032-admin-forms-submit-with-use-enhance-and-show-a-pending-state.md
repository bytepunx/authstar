---
id: T-0032
type: task
nature: remediation
title: "Admin forms submit with use:enhance and show a pending state"
status: backlog
parent: S-0011
owner: bytepunx
created: 2026-11-06T17:49:34Z
updated: 2026-11-06T17:49:53Z
transitions: []
stream: S-0011
tags: [web]
touches: [web/src/lib/components/SubmitButton.svelte, web/spec/components/submit-button.spec.ts, web/src/routes/(admin)/applications/new/+page.svelte, "web/src/routes/(admin)/applications/[slug]/+page.svelte", "web/src/routes/(admin)/billing/organizations/[organizationId]/+page.svelte", web/src/routes/(admin)/billing/plan-mappings/new/+page.svelte, "web/src/routes/(admin)/billing/plan-mappings/[id]/+page.svelte", web/src/routes/(admin)/billing/stripe-config/+page.svelte]
---
# T-0032 Admin forms submit with use:enhance and show a pending state

## Work

- Add `web/src/lib/components/SubmitButton.svelte`. It takes a `pending` prop. While pending it is disabled, has `aria-busy="true"`, and shows a pending label.
- Give each form in the six `(admin)` pages below `use:enhance` from `$app/forms`, with a submit callback. The callback sets a per-form `pending` state, clears it when the result arrives, and calls `update()`, so `form` data, `fieldErrors`, `formError`, and redirects behave as they do now.
  - `applications/new`
  - `applications/[slug]`, which has four forms
  - `billing/organizations/[organizationId]`, which has four forms
  - `billing/plan-mappings/new`
  - `billing/plan-mappings/[id]`, which has two forms
  - `billing/stripe-config`
- Use `SubmitButton` as each form's submit control. Forms stay working without JavaScript.
- Write a component test, `web/spec/components/submit-button.spec.ts`. It covers the idle and pending renderings and that the button is disabled while pending.

## Done when

- [ ] Every form in the six `(admin)` pages uses `use:enhance`, and its button is disabled with a pending label while the action runs.
- [ ] `web/spec/components/submit-button.spec.ts` passes, and the existing behavior and e2e specs for these pages still pass.

## Notes

The `(embed)` forms and signup follow in T-0033, which reuses `SubmitButton`.

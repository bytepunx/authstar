---
id: T-0033
type: task
nature: remediation
title: Embed forms and signup show a pending state
status: done
parent: S-0011
owner: bytepunx
created: 2026-11-06T17:49:58Z
updated: 2026-11-09T07:58:10Z
transitions:
  - to: ready
    at: 2026-11-09T07:40:51Z
    by: agent-S-0011
  - to: in-progress
    at: 2026-11-09T07:40:51Z
    by: agent-S-0011
  - to: done
    at: 2026-11-09T07:58:10Z
    by: agent-S-0011
stream: S-0011
tags: [web]
touches: ["web/src/routes/(embed)/applications/[applicationSlug]/api-keys/+page.svelte", "web/src/routes/(embed)/organizations/[organizationId]/+page.svelte", "web/src/routes/(embed)/organizations/[organizationId]/applications/[applicationSlug]/api-keys/+page.svelte", web/src/routes/(hosted)/signup/+page.svelte]
after: [T-0032]
usage:
  source: log
  seconds: 1039
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 20
      output: 6086
      cache_read: 1849983
      cache_write: 25453
      cost: 0.6642
---
# T-0033 Embed forms and signup show a pending state

## Work

- Give each form in the three `(embed)` pages `use:enhance` with the same per-form `pending` state and `SubmitButton` that T-0032 introduced. Call `update()` so the result handling stays as it is now.
  - `applications/[applicationSlug]/api-keys`, which has two forms
  - `organizations/[organizationId]`, which has six forms
  - `organizations/[organizationId]/applications/[applicationSlug]/api-keys`, which has two forms
- The signup form at `(hosted)/signup/+page.svelte` posts to tower from the browser through `submitSignup` and has no form action, so `use:enhance` does not apply. Set its `pending` state around `handleSubmit` and use `SubmitButton`, so a double submit is not possible.

## Done when

- [ ] Every form in these four pages shows a disabled, pending button while it submits.
- [ ] The existing behavior specs and the `embed-organization` and `signup` e2e specs still pass.

## Notes

This task waits for T-0032, which writes `SubmitButton`.

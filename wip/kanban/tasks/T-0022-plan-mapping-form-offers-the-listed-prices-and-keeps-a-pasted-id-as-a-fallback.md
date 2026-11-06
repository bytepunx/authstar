---
id: T-0022
type: task
nature: feature
title: Plan-mapping form offers the listed prices and keeps a pasted ID as a fallback
status: cancelled
parent: S-0008
owner: bytepunx
created: 2026-11-06T17:47:33Z
updated: 2026-11-06T17:51:28Z
transitions:
  - to: cancelled
    at: 2026-11-06T17:51:28Z
    by: agent-S-0008
stream: S-0008
tags: [web]
touches: [web/src/routes/(admin)/billing/plan-mappings/new/+page.svelte, web/src/routes/(admin)/billing/plan-mappings/new/+page.server.ts, web/spec/behavior/billing-plan-mappings.spec.ts]
after: [T-0020]
---
# T-0022 Plan-mapping form offers the listed prices and keeps a pasted ID as a fallback

## Work

- In `web/src/routes/(admin)/billing/plan-mappings/new/+page.svelte`, replace the free-text price field with a choice of the loaded prices. Label each choice with its product name, its amount formatted in its currency, and its interval, or "one-off" when it has none. Add an "another price ID" text field for a price the list does not show. Show the notice from `load` when there is one, and fall back to the text field alone when the list is empty.
- In the default action in `+page.server.ts`, take the pasted ID when it is given, otherwise the chosen one. Keep the `stripePriceId is required` error when neither is given. When the form fails, it re-renders with the choice and the pasted value kept.
- Extend `web/spec/behavior/billing-plan-mappings.spec.ts`: a chosen price submits its ID, a pasted ID wins over a choice, and neither gives the field error.

## Done when

- The behavior spec passes, and so do `make test` and `make lint` in web.
- With keep and the fake Stripe, or test mode, an admin can create a mapping by choosing a listed price and by pasting an ID.

## Notes

This is S-0008's second criterion.
- 2026-11-06T17:51:28Z: moved to cancelled: duplicates T-0026, which covers the form and its action (TH-0008)

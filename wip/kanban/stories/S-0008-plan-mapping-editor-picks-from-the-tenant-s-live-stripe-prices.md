---
id: S-0008
type: story
nature: feature
title: Plan-mapping editor picks from the tenant's live Stripe prices
status: backlog
parent: E-0002
owner: alex
created: 2026-10-21T05:13:12Z
updated: 2026-10-21T05:13:12Z
transitions: []
tags: []
---
# S-0008 Plan-mapping editor picks from the tenant's live Stripe prices

## Goal

Creating a plan mapping in web lists the tenant's active Stripe prices and products instead of asking for a pasted price ID, as ADR-0046 requires.

## Acceptance criteria
- [ ] Keep exposes a read-only route listing the tenant's active prices with product name, amount, currency, and interval, from the tenant's own Stripe key
- [ ] Web's plan-mapping form offers those prices and submits the chosen ID; pasting remains possible for a price the list does not show
- [ ] Keep's fake Stripe covers the listing in behavior tests and the live tier covers it against test mode

## Tasks

## Notes

`web/src/routes/(admin)/billing/plan-mappings/new/+page.server.ts` takes a pasted ID; keep's `stripe-client.ts` has no prices list call.

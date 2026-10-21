---
id: S-0007
type: story
nature: feature
title: Hosted upgrade page that starts a Stripe checkout
status: backlog
parent: E-0002
owner: alex
created: 2026-10-21T05:13:12Z
updated: 2026-10-21T05:13:12Z
transitions: []
tags: []
---
# S-0007 Hosted upgrade page that starts a Stripe checkout

## Goal

A user who clicks `<authstar-upgrade-button>` lands on the hosted `/_authstar/upgrade` page, picks a plan from the tenant's plan mappings, and is sent to a Stripe Checkout session keep creates; after payment the webhook grants the mapped roles and the user returns to the application. This is the first caller of keep's checkout-sessions route.

## Acceptance criteria
- [ ] Web serves `/_authstar/upgrade` under `(hosted)` per ADR-0065, listing the tenant's active plan mappings with their price details
- [ ] Choosing a plan calls keep's checkout-sessions route with the caller's scope and redirects to Stripe
- [ ] Success and cancel return URLs land back on the application with a clear state
- [ ] The integration harness's golden path exercises the page against Stripe test mode and the resulting `checkout.session.completed` webhook
- [ ] `docs/users/` describes the upgrade flow

## Tasks

## Notes

Depends on nothing but is more useful after S-0008 gives the page price details. `web/src/widgets/upgrade-button.ts` already links to the page. `keep/src/routes/checkout-sessions.ts` exists with no caller.

---
title: Users guide
updated: 2026-11-13
status: draft
---

# authstar for users

authstar signs you in to the applications a tenant runs behind it and tells those applications what you are entitled to. Most of it is invisible: you log in through the provider the application offers and arrive back in the application with a session.

## Self-service widgets

An application can embed authstar's Web Components to show you your own account data without leaving the page. They talk to the application's own origin under `/_authstar/me/`, so they work wherever the application does.

| Widget | Shows | Reads |
|--------|-------|-------|
| `<authstar-subscription-status>` | Your current plan and its status (`active`, `trialing`, `past_due`, `canceled`, and the other states Stripe reports), and when the current period ends; "No active subscription" when you have none | `/_authstar/me/subscription` |
| `<authstar-upgrade-button>` | A link to the application's upgrade page | nothing |

If a widget shows an error instead of your data, you are signed out or the application's billing service is unavailable; signing in again fixes the first.

## Plan roles and non-payment

A plan grants its roles when a subscription to it starts. When the subscription lapses, keep removes those roles again. Whatever else the account or organization holds stays.

A role the plan grants is removed on degrade even when an admin granted it as well. Tower keeps no record of where a role came from ([ADR 0108](../../design/adrs/0108-plan-mappings-grant-roles-granted-roles-is-tower-s-set-in-effect.md)).

To keep a role through non-payment, give it a name no plan mapping uses.

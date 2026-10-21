---
title: Users guide
updated: 2026-10-21
status: active
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

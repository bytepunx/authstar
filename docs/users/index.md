---
title: Users guide
updated: 2026-11-10
status: draft
---

# authstar for users

Start here.

## Plan roles and non-payment

A plan grants its roles when a subscription to it starts. When the subscription lapses, keep removes those roles again. Whatever else the account or organization holds stays.

A role the plan grants is removed on degrade even when an admin granted it as well. Tower keeps no record of where a role came from ([ADR 0108](../../design/adrs/0108-plan-mappings-grant-roles-granted-roles-is-tower-s-set-in-effect.md)).

To keep a role through non-payment, give it a name no plan mapping uses.

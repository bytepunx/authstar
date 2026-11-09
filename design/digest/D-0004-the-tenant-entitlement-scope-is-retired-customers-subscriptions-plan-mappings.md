---
id: D-0004
title: "The tenant entitlement scope is retired: customers, subscriptions, plan mappings, and entitlement events are scoped to an account or an organization"
kind: decision
sources: [S-0004]
topics: [billing, keep, tower]
paths: [keep/src/lib/scope.ts, tower/src/actors/tenant_actor.ts, tower/src/lib/entitlement-consumer.ts, design/adrs/0109-entitlement-scopes-are-accounts-and-organizations-the-tenant-scope-is-retired.md]
date: 2026-11-06
status: absorbed
absorbed_by: "design/adrs/0109-entitlement-scopes-are-accounts-and-organizations-the-tenant-scope-is-retired.md#decision"
asked_again: []
cited: [S-0005, S-0014, T-0070, TH-0025]
---

# D-0004 The tenant entitlement scope is retired: customers, subscriptions, plan mappings, and entitlement events are scoped to an account or an organization

S-0004 decided, in its narrative's Decisions: "Tenant scope retired rather than fanned out (ADR-0109); the tower side is its own story because it is a breaking change to tower."

Since ADR-0046 each tenant owns its Stripe account, so a tenant cannot be its own customer, and tower already dropped role events with no account or organization id. Keep refuses a `{tenant}` scope with a 400; tower removes `tenant.seatLimit` and logs a scope-less role event as malformed. Seat limits live on organizations (ADR-0100). Fanning a tenant plan out to every account was rejected as an ownerless entitlement leak.

ADR-0109 states this, but it is on `story/S-0004`, not yet on `main` (I-0004). Keep's side is S-0005; tower's side is a separate story under E-0002.

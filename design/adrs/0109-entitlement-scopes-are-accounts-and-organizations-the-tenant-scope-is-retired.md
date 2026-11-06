---
id: ADR-0109
title: Entitlement scopes are accounts and organizations; the tenant scope is retired
status: accepted
date: 2026-10-21
supersedes: []
superseded_by: []
refines: [ADR-0031, ADR-0046, ADR-0100]
---

# ADR-0109 Entitlement scopes are accounts and organizations; the tenant scope is retired

## Context

ADR-0031 and ADR-0038 gave subscriptions, customers, and plan mappings a `{tenant}` scope beside `{account}`, and gave `tenant` a `seatLimit` fed by `entitlement.seat-limit-changed`. That was ADR-0042's model, in which the tenant was a customer of the installation. ADR-0046 superseded it: each tenant owns its Stripe account, so a tenant cannot be its own customer. ADR-0100 then added `{organization}` as the scope for purchases made on behalf of a group of users. The code still carries the remnant: keep's `Scope` allows `{tenant}`, keep publishes tenant-scoped role events, and tower's `entitlement-consumer.ts` drops any `role-granted` or `role-revoked` with no account or organization id, so a tenant-scoped plan grants nothing and nobody is told.

## Decision

The entitlement scopes are `{account}` and `{organization}`. The `{tenant}` scope is retired from customers, subscriptions, plan mappings, and every `entitlement.*` event.

- **Keep** refuses a checkout session, plan mapping, trial, or coupon whose scope is `{tenant}` with a 400 that says so, and stops publishing any event with that scope. Its `Scope` type and the per-actor scope types become one type with the two members.
- **Tower** removes `tenant.seatLimit`, the `tenant.set-seat-limit` command, and the tenant branch of `seat-limit-changed` in the consumer. A role event with neither scope is logged as malformed, not silently dropped.
- **Seat limits** live on organizations (ADR-0100). An individual account has no seat limit.
- **Existing records** with `{tenant}` scope in a keep database are reported by a one-off `keep` script and left untouched; none exist outside the integration harness today.

## Consequences

- A plan always grants to someone who can hold roles.
- The tower change is breaking for any caller of `tenant.seatLimit`; the audit found none outside tower's own tests. It is its own story under E-0002 because it changes tower, not keep.
- Code: `keep/src/lib/scope.ts`, the four actors' scope types, `keep/src/routes/checkout-sessions.ts`, `plan-mappings.ts`, `trials.ts`, `coupons.ts`, `webhooks.ts`; `tower/src/actors/tenant_actor.ts`, `tower/src/lib/entitlement-consumer.ts`. S-0005 carries keep; a tower story follows.
- `design/system/overview.md` principles say who can be a customer.

## Alternatives considered

- Make a tenant-scoped plan grant roles to every account in the tenant: a fan-out with no owner and the entitlement-leak problem ADR-0100 removed for organizations.
- Keep `{tenant}` for seat limits only: leaves a scope that two of three event types must refuse; organizations already carry seat limits.
- Leave it and document the drop: the audit's finding was exactly that a silent drop misleads.

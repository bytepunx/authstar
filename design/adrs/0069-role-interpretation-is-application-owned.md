---
id: ADR-0069
title: Role Interpretation Is Permanently Application-Owned
status: accepted
date: 2026-08-01
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0069: Role Interpretation Is Permanently Application-Owned

- **Status:** Accepted
- **Date:** 2026-08-01
- **Affects:** tower, portcullis
- **Resolves the open item in:** [ADR 0017](0017-account-identity-and-role-model.md)

## Context

ADR 0017 left one question explicitly undecided: once an application receives `roles:
string[]` in its claims, how does it learn what a role actually grants — entirely inside the
consuming application, entirely centralized in tower/`web`, or some hybrid? Nothing has
resolved it since, and the Web Component inventory (the next design item) needs an answer
first: several widgets (subscription status, usage meter, an "upgrade" button) have to decide
whether they reason about `roles` at all, or only about billing/entitlement state.

Every mechanism that grants a role, surveyed across the whole design so far, already treats it
as a pure opaque tag with no interpretation attached:

- `invite`/`inviteCode` (ADR 0018/0019) attach a `roles` list verbatim; issuance is gated by
  `permissions`, never by knowledge of what the granted role *means*.
- `keep`'s `planMapping.grantedRoles` (ADR 0038) is tenant-authored — the tenant decides what
  string a given Stripe price grants, keep never inspects it.
- Direct role grants on an account (ADR 0030) accept any `(name, scope)` validated only against
  the existence of a `roleDefinition` (ADR 0047) — validated as a registered *name*, never as a
  set of capabilities.

Nothing in this design has ever needed tower, keep, or portcullis to know what a role name
*does* — only that it exists and who holds it.

## Decision

**Role interpretation stays entirely inside the consuming application, permanently — not a
placeholder for a later centralized or hybrid mechanism.** Tower continues to assert "this
account holds role X for application Y" (ADR 0017's shape, unchanged); the application alone
decides what X unlocks in its own product. This closes ADR 0017's open question rather than
leaving it open indefinitely:

- **No centralized-in-tower option.** There is no future in which tower ships a
  role-name-to-capability mapping. If a piece of authorization logic ever needs to be
  cross-application or authstar-enforced, the existing `permissions` primitive (ADR 0018,
  closed/catalogued vocabulary, ADR 0051) is the mechanism for that — not a second,
  role-based system duplicating it. The two stay permanently distinct: `roles` are an open,
  app-defined vocabulary for product-level authorization; `permissions` are a closed,
  tower-defined vocabulary for authstar's own control-surface authorization
  (`_admin`/`steward`).
- **No hybrid.** A hybrid was the option most likely to erode the size/latency reasoning ADR
  0017 already gave for keeping claims small — any tower-side interpretation, even partial,
  reopens the question of what belongs in the token.
- Consequence for design work downstream: anything that needs to reason about "what can this
  user do in *this* product" is out of scope for authstar entirely — that logic, and any UI
  that reflects it, lives in the adopting application, not in `web`, `tower`, or any embeddable
  widget. Embeddable widgets (next item) therefore reason only about **entitlement/billing
  state** (from `keep`, via `entitlement.*`) and **account/identity state** (from `tower`),
  never about product-level `roles` meaning.

## Consequences

- ADR 0017's "explicitly undecided" framing is resolved — no follow-on tower work implied.
- No new tower API surface for role-to-capability lookup, now or later.
- The Web Component inventory can proceed knowing widgets never need to interpret `roles`.

## Related

- [ADR 0017](0017-account-identity-and-role-model.md), [ADR 0018](0018-trial-roles-and-keep-boundary.md), [ADR 0019](0019-invite-codes.md), [ADR 0038](0038-plan-mapping-and-subscription-tracking.md), [ADR 0047](0047-application-and-role-slug-validation.md), [ADR 0051](0051-web-applications-and-identity-access-screens.md)

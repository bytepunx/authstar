---
id: ADR-0015
title: Exempt Routes Are Never Blocked by the Enrichment Outcome
status: accepted
date: 2026-07-22
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0015: Exempt Routes Are Never Blocked by the Enrichment Outcome

- **Status:** Accepted
- **Date:** 2026-07-22
- **Affects:** portcullis
- **Corrects:** reasoning introduced while adapting `ref-design` Story 013 under
  [ADR 0001](0001-claims-enrichment-via-tower.md)/[ADR 0003](0003-enrichment-outcome-response-contract.md)

## Context

While rewriting the auth gate's decision flow (Story 013) to incorporate the three-way
`Allow`/`Deny`/`Unreachable` enrichment outcome, it was written such that a `Deny` (or an
`Unreachable` outcome under a fail-closed policy) rejected the request **even on an exempt
route** — the stated rationale being that a locked account shouldn't reach an exempt upstream
just because the route itself needs no auth to reach.

That's wrong. Exempt means the route is public-facing by definition — an anonymous visitor
with no session at all is let through. If a visitor who happens to be carrying a *denied*
session cookie gets blocked from that same route, they end up worse off than the anonymous
visitor, purely because they were once authenticated. That inverts the meaning of "exempt" and
makes carrying a session strictly riskier than carrying none on a route that's supposed to
need no session at all.

## Decision

Route exemption can only ever turn a would-be rejection into a pass-through; it can never turn
a pass-through into a rejection, and it never causes the enrichment outcome itself to be
skipped.

Concretely, for a request with a valid session JWT on an **exempt** route:

- `Allow`, or `Unreachable` under a fail-open policy → unchanged: sign the internal token
  (with `enrichment_status` `"ok"`/`"degraded"` respectively) and forward — this is the
  existing opportunistic-identity behavior, already correct.
- `Deny`, or `Unreachable` under a fail-closed policy → the request is **not** rejected. It is
  forwarded **without** an `Authorization` header — identical to how an anonymous request to
  that same route is already handled. No internal token is generated.

Blocking a request outright (any of the responses in Story 015) is reserved exclusively for
**protected** (non-exempt) routes. On an exempt route, the enrichment outcome only ever affects
what identity, if any, gets attached to the forwarded request — never whether the request is
forwarded at all.

## Consequences

- Story 013's decision flow and acceptance criteria need correcting — the note claiming this
  as a "deliberate strengthening over `ref-design`" was itself the error and needs replacing,
  not just qualifying.
- Story 010's `Deny`/`Unreachable`-fail-closed acceptance criteria need a route-exemption
  caveat: rejection only applies on protected routes.
- Story 015's `Deny`/`Unreachable`-fail-closed response contracts apply only when the route is
  not exempt.
- No change to protected-route behavior, and no change to `Allow`/fail-open behavior on any
  route — this correction is scoped entirely to the exempt + (`Deny` or fail-closed
  `Unreachable`) combination.

## Related

- [ADR 0001](0001-claims-enrichment-via-tower.md), [ADR 0003](0003-enrichment-outcome-response-contract.md)

---
title: "Story 001: Connect and Session"
updated: 2026-08-06
status: draft
---
# Story 001 — Connect and Session

**Epic:** Operator Console
**Repo:** steward
**Status:** Draft
**New — steward's side of the flow [ADR 0045](../../adrs/0045-steward-operator-console.md)/
[ADR 0048](../../adrs/0048-steward-ux.md) already specify.**
Per [ADR 0021](../../adrs/0021-cli-operator-bootstrap.md),
[ADR 0045](../../adrs/0045-steward-operator-console.md),
[ADR 0048](../../adrs/0048-steward-ux.md).
**Depends on:** [tower Story 013](../tower/013-operator-api.md)'s bearer-token auth model and
`X-Operator-Actor` attribution requirement, reused unchanged.

---

## Summary

Unlike `web`, `steward` is not a normal, bookmarkable app — every session starts cold, with the
operator re-entering the token, reflecting the deliberate-friction posture ADR 0045 established
for this highly-privileged, rarely-used surface. This is the one story where "session
management" means something genuinely different from every other service's login flow in this
design: there's no OIDC, no cookie, no server-side session record at all.

---

## Connect Screen

- [ ] On load (every load — no "remember me"), prompts for the operator bearer token and a
      **required** free-text "acting as" label. Required, not optional — a skippable field would
      undercut the only accountability signal available under a shared credential (ADR 0045).
- [ ] The token is held in memory for the tab's lifetime only — **never** `localStorage`, at most
      `sessionStorage`. A fresh port-forward session means re-entering it; this is intentional
      friction, not an oversight to smooth over later.
- [ ] On submit, confirms the token against tower (a lightweight authenticated call — e.g.
      `GET /operator/tenants` with `limit=0`, or an equivalent cheap check) and displays which
      installation/environment it's talking to, surfaced from tower's own identity/version info
      — a safety measure against acting on the wrong installation when an operator manages more
      than one. An invalid token shows a clear, generic auth-failure message; a network failure
      (tower unreachable) shows a distinct "can't reach tower" message — these are different
      problems and should read as different problems.
- [ ] The "acting as" label, once submitted, is held alongside the token for the rest of the
      session — it's what gets sent as `X-Operator-Actor` on every mutating request this session
      makes ([tower Story 010](../tower/010-activity-feed.md)'s requirement, reused unchanged
      here, not re-derived).

---

## Session Behavior

- [ ] Every request steward makes to tower's or keep's operator trees forwards the same token as
      `Authorization: Bearer` — one token, both backends, each independently validating it
      against its own copy (ADR 0045's "one shared operator-token, not one per backend service").
- [ ] Every **mutating** request additionally carries `X-Operator-Actor` — steward doesn't let a
      mutating action proceed without it, since the label is already guaranteed present (required
      at connect time); this is enforcement on tower's/herald's side ([tower Story 010](../tower/010-activity-feed.md)),
      not something steward needs to separately validate before sending.
- [ ] No token refresh, no silent re-auth — if tower/keep ever reject the token (revoked,
      rotated), steward drops back to the Connect screen with a clear "your session is no longer
      valid, reconnect" message, discarding whatever in-memory state existed for the tenant
      context the operator was in.
- [ ] Closing the tab or navigating away loses the session entirely — there is no persistence
      layer to lose it *from*.

---

## Not Covered Here

- What happens after connecting — [Story 002](002-tenant-search-and-creation.md)'s tenant search
  landing page.
- The environment-confirmation display's exact visual treatment — a `web`/`steward`-side design
  decision, not an API contract.

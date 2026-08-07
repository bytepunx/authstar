# Story 007 — Analytics

**Epic:** Admin App
**Repo:** web
**Status:** Draft
**New — web's side of the screens [ADR 0059](../../decisions/0059-web-analytics-screens.md)
already specifies.** Per [ADR 0058](../../decisions/0058-analytics-event-shape-corrections.md),
[ADR 0059](../../decisions/0059-web-analytics-screens.md).
**Depends on:** [chronicle Story 002](../chronicle/002-reporting-api.md) — every route this
screen calls.

---

## Auth Funnel

- [ ] Login attempts/success/failure by provider, signup conversion, invite/code redemption
      trend — calls `GET .../reports/auth-funnel` (chronicle Story 002).
- [ ] **The redemption figure is shown as a count/trend, never framed as a "rate"** — chronicle's
      own report doesn't have the denominator (issuance counts live in tower, not chronicle's
      pipeline, chronicle Story 002's own named limitation) to compute redeemed-over-issued. If
      this screen wants an actual rate, it has to separately call tower for issuance counts and
      compute the ratio itself, client-side — not something to silently imply the single
      chronicle call already provides.

## Active Users

- [ ] DAU/WAU/MAU, `granularity` selector, optional `application` filter — calls
      `GET .../reports/active-users` (chronicle Story 002), the **same underlying call**
      Overview's own tile uses ([Story 002](002-overview.md)), just the full time-series view
      instead of current-period-only.
- [ ] Omitting the application filter dedupes tenant-wide (the cross-application rollup
      tenant-scoped identity resolution exists to enable); selecting one scopes the same dedup to
      that product alone.

## Explore

- [ ] A UI directly over chronicle's constrained query endpoint (`POST .../analytics/query`,
      chronicle Story 002) — `metric`/`eventType`/`groupBy`/`filters`/`dateRange` builders, not a
      free-text query box, since the backend itself only accepts values from a fixed vocabulary
      (chronicle Story 002) — this screen's own controls should be a fixed set of dropdowns/
      pickers matching that vocabulary exactly, not an interface that could construct a request
      the backend would reject.
- [ ] Renders `{ results: [...] }` (chronicle Story 002's response shape) directly into a chart —
      the response was deliberately shaped to be exactly what a charting library consumes without
      transformation.

## Explicit Scope Boundary

- [ ] **No person-level lookup anywhere in this section** — chronicle only ever has
      `identityHash`, never a resolvable identity, and this section's own screens never attempt
      to join against tower's `contact`/`account` data to work around that. Looking up what a
      *specific person* did is Privacy & Compliance's job ([Story 008](008-privacy-and-compliance.md)),
      reached through tower's own export mechanism, not this section — a deliberate boundary, not
      a missing feature.

---

## Not Covered Here

- The Overview tile that shares Active Users' underlying call — [Story 002](002-overview.md).
- Privacy & Compliance's contact-level export (the actual "what did this person do" answer) —
  [Story 008](008-privacy-and-compliance.md).

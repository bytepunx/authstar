---
id: ADR-0057
title: "`web`'s Data Export Screen"
status: accepted
date: 2026-08-01
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0057: `web`'s Data Export Screen

- **Status:** Accepted
- **Date:** 2026-08-01
- **Affects:** web
- **Depends on:** [ADR 0056](0056-gdpr-data-export.md)
- **Extends:** [ADR 0055](0055-web-privacy-compliance-screens.md)

## Decision

One more action on the same Contact detail view erasure already lives on.

### One more action on the same Contact detail view erasure already lives on

No new screen needed — Privacy & Compliance's Contact detail view (ADR 0055) gains an "Export
Data" action alongside "Erase Data," both reached from the same email-search flow already
built. This keeps the two GDPR actions available from the same place an admin would naturally
look for either, rather than splitting them across separate sections.

### Export triggers a direct download, generated fresh, never stored

Clicking "Export Data" calls the four backend export endpoints (ADR 0056) in parallel from
`web`'s own server layer and hands the assembled JSON directly to the browser as a download —
no intermediate storage, no "export ready, come back later" flow. If any section came back
partial (a service was briefly unreachable), the download's structure marks that section
clearly rather than silently presenting an incomplete document as whole; the UI surfaces the
same thing before the download starts, with a one-click retry.

### Gated by the new `contacts:export` permission, distinct from `contacts:read`

Consistent with ADR 0056 — an admin who can view a contact's basic info doesn't automatically
get the ability to pull their full cross-service data aggregate.

## Consequences

- No new information architecture — this is one additional action on an existing screen.
- Self-service export (an end user requesting their own data) is out of scope for `web`'s admin
  surface entirely, per ADR 0056 — it belongs to the future embeddable-widget pass.

## Related

- [ADR 0055](0055-web-privacy-compliance-screens.md), [ADR 0056](0056-gdpr-data-export.md)

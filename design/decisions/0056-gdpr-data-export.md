# ADR 0056: Data Export — Right of Access and Portability (GDPR Article 15/20)

- **Status:** Accepted
- **Date:** 2026-08-01
- **Affects:** tower, keep, herald, chronicle, web
- **Resolves the gap named in:** [ADR 0055](0055-web-privacy-compliance-screens.md)

## Context

This design has thoroughly covered GDPR's right to erasure (Article 17) but never addressed
the right of access (Article 15) or portability (Article 20) — the right to obtain a copy of
one's own personal data in a structured, machine-readable form. Unlike erasure, this doesn't
need guaranteed eventual completion across services — it's a point-in-time read an admin (or
the data subject) can simply retry if something's briefly unreachable. Copying erasure's async
fan-out/acknowledgment machinery here would be solving a consistency problem export doesn't
actually have.

## Decision

### `web` orchestrates; no service gains a new dependency on another

`web` already talks to tower, keep, herald, and chronicle independently as their BFF. It calls
each service's own new export endpoint (below) in parallel, server-side (SvelteKit's own server
layer, not the browser), and assembles one JSON document. No service calls another to make this
work — tower doesn't reach into keep/herald/chronicle, preserving the boundary this design has
maintained everywhere except the one justified exception (portcullis→tower enrichment).

### Per-service export endpoints

**Tower** — `GET /tenants/{tenantSlug}/contacts/{contactId}/export`, gated by a new
`contacts:export` permission (distinct from and broader than `contacts:read` — aggregating
everything into one document is more sensitive than the contact-detail view alone):

```json
{
  "contact": { "email": "", "name": "" },
  "account": { "accountId": "", "status": "", "grantedRoles": [], "trialRoles": [], "permissions": [], "createdAt": "" },
  "identities": [ { "idp": "" } ],
  "invitesReceived": [ "..." ],
  "inviteCodesIssued": [ "..." ],
  "identityHashes": [ "..." ]
}
```

`identities` shows which providers are linked (`idp` names only — the raw `identityHash` values
aren't meaningful to the data subject, just an internal correlation artifact). `identityHashes`
is a separate field carrying those same raw values, used internally by `web` to query chronicle
(below) — not something `web` displays directly to whoever receives the final export.
**Correction found**: this requires resolving all `identity` records for an account, which needs
`accountId` in `identity.searchableBy` (ADR 0027) — not present today, added here.

**Keep** — `GET /tenants/{tenantSlug}/accounts/{accountId}/export` (`accountId`-keyed, not
`contactId` — keep has never known `contactId` directly, ADR 0040):

```json
{ "customer": { "stripeCustomerId": "" }, "subscriptions": [], "trials": [], "usageRecords": [] }
```

Full Stripe payment/invoice history is not pulled live — `stripeCustomerId` is included as a
reference, with a note that the tenant's own Stripe dashboard is the system of record for
detailed billing history. A live Stripe pull is a reasonable future enhancement, not required
for this to be a legitimate first version.

**Herald** — `GET /tenants/{tenantSlug}/contacts/{contactId}/export`:

```json
{ "communications": [ { "type": "", "status": "", "sentAt": "", "renderedContent": null } ], "optOuts": [] }
```

`renderedContent` is populated (via herald's existing on-demand render capability, ADR 0025)
only for communications still within their retention window (ADR 0029); once purged, the entry
carries its minimal audit fields only — expected behavior, not an error.

**Chronicle** — `POST /tenants/{tenantSlug}/analytics/export-summary`, body
`{ "identityHashes": [...] }` (a list, hence `POST`, consistent with the existing constrained
query endpoint's own convention, ADR 0036):

```json
{ "eventCounts": { "auth.login-succeeded": 0, "request": 0 }, "firstSeen": "", "lastSeen": "" }
```

**Deliberately a summary, not a raw event dump** — the volume of raw per-request analytics
events over time isn't meaningful to a data subject and would dwarf everything else in the
export. Aggregate counts and an activity date range satisfy "access to what's processed and why"
without turning the export into an unreadable firehose.

### A known, honest limitation: coupon/invite-code redemption isn't individually attributable

Neither `coupon` nor `inviteCode` track *who* redeemed them (ADR 0019/0039 — both use a bare
`redemptionCount`, no per-redeemer list). This isn't a new gap introduced here; it's an existing
property of the data model. Export can't answer "which codes did I redeem" and shouldn't pretend
otherwise — named honestly rather than silently omitted.

### Partial failure is marked, never silently hidden

If one service is unreachable when `web` assembles an export, the response includes as many
sections as succeeded, with the failed section clearly marked "unavailable, retry to include" —
not a hard failure requiring a full redo, and never presented as if it were complete when it
isn't. Given GDPR's own response-time obligations (the same pressure erasure's compliance
tracking already accounts for), handing over most of the picture with a clear gap beats forcing
a wait on every retry.

### Generated on demand — no new PII at rest

The assembled export is never stored; it's generated fresh per request and handed directly to
whoever receives it. Storing generated exports would create a new pile of aggregated PII with
its own retention/security lifecycle to design — avoided entirely by not persisting it.

### Lightweight audit record — not a completion-tracking actor like `erasureRequest`

A new tower actor, `exportRequest`: `{ tenant, contactId, requestedBy, requestedAt }` — proof
that an access request was processed and when, for the same compliance-auditability reason
`erasureRequest` exists. No `acknowledgedBy`/`expectedServices` — there's no async multi-service
completion to track, since the whole operation is synchronous from `web`'s perspective.

### Self-service path, noted but not designed in full here

`GET /me/export` — resolves the caller's own `contactId` from their already-authenticated
identity (the same portcullis-forwarded context enrichment already provides), requiring no
special permission at all, since acting on one's own data needs only being authenticated as
oneself. Its actual UI (most naturally an embeddable Web Component, "download my data") is
deferred to the future embeddable-widget-inventory pass, the same way the invite-code
self-service case was deferred in ADR 0051 — noted here so the mechanism exists and is
consistent, not designed twice. **Formalized generally by
[ADR 0070](0070-self-service-identity-linking.md)**: self-action on one's own resource never
needs a `permissions` grant — this route and ADR 0070's own self-service identities routes are
two instances of the same rule, just keyed differently (`contactId`-resolved-from-session here,
`{accountId}`-matches-caller there) to match each route's own resource shape.

## Consequences

- `identity.searchableBy` (ADR 0027) gains `accountId`.
- Four new/extended endpoints across tower, keep, herald, chronicle.
- New tower actor `exportRequest` and new permission `contacts:export`.
- `web`'s Privacy & Compliance screens gain an export action alongside erasure (ADR 0057).

## Related

- [ADR 0023](0023-pii-isolation-via-hashed-contact-records.md), [ADR 0025](0025-versioned-templates-and-encrypted-payloads.md), [ADR 0026](0026-erasure-cascade.md), [ADR 0027](0027-portcullis-computed-identity-hash.md), [ADR 0029](0029-herald-payload-retention.md), [ADR 0035](0035-lookout-and-chronicle-analytics.md), [ADR 0036](0036-chronicle-reporting-api-and-retention-config.md), [ADR 0040](0040-keep-erasure-response.md), [ADR 0055](0055-web-privacy-compliance-screens.md)

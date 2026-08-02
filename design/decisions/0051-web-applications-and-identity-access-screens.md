# ADR 0051: `web`'s Applications and Identity & Access Screens

- **Status:** Accepted
- **Date:** 2026-08-01
- **Affects:** web, tower
- **Extends:** [ADR 0049](0049-web-admin-information-architecture.md)
- **Depends on:** [ADR 0050](0050-portal-reserved-application.md)

## Context

Designing these two sections in detail against tower's exact actor shapes (ADR 0016/0017/0018/
0019/0020/0023/0047) surfaced several real gaps and one structural finding (ADR 0050) — this
ADR covers both the screen designs and the corrections found along the way.

## Decision

### Applications section

**List** — slug, name, hosts, status. `_admin` is excluded from this list entirely, not just
filtered — it's system-managed, and exposing it here invites an admin to "fix" something that
breaks their own access to fix it. (`_portal`, from an earlier design, no longer exists as a
separate application — [ADR 0066](0066-portcullis-proxies-branded-pages-to-web.md).)

**Create / Edit**, sub-sectioned to match the application actor's own shape (ADR 0020) exactly:

- **Basic Info** — slug (immutable after creation, since it's embedded in the business key and
  referenced elsewhere), name, status.
- **Hosts** — list of hostnames. The UI designates one as **primary**; `publicUrl` is derived
  from it (`https://{primary}`), not independently entered. **Correction found:** ADR 0020/
  Story 001 showed `hosts` and `publicUrl` as sibling fields with no stated relationship — two
  independently-editable fields that are supposed to agree is an unforced error waiting to
  happen (a mismatched `publicUrl` breaks OAuth `redirect_uri` construction, Story 005). Fix:
  tower's application write path validates that `publicUrl`'s host is present in `hosts`,
  rejecting a write that violates it — the UI's primary-host derivation keeps this from ever
  being hit in practice, and the validation is the server-side backstop for direct API callers.
  Hosts that aren't subdomains of the tenant's cookie domain get a UI warning that this
  application won't get silent SSO with the tenant's other applications (ADR 0016).
- **Upstream** — base URL, prefix routes, timeout.
- **CORS** — allowed origins.
- **Exempt Paths** — exact and prefix-wildcard patterns (Story 003).
- **Auth** — `loginUrl`, shown **read-only**, always `/oauth2/select` on this application's own
  host, tenant-branded via `web` proxy-through
  ([ADR 0066](0066-portcullis-proxies-branded-pages-to-web.md)) unless explicitly overridden to
  a fully custom, tenant-hosted login page (Story 018's flagged future enhancement) — not
  further designed here.
- **Exposed Providers** — an ordered, reorderable multi-select drawn from the tenant's own
  provider catalog (Identity & Access, below) — this is *this application's* subset/ordering of
  the tenant-wide credentials, not a duplicate of them.
- **Usage-Reporting Credentials** (added by [ADR 0079](0079-batched-usage-reporting-credentials.md))
  — list (metadata only), issue (secret shown once), revoke. For batched/background usage
  reporting specifically; unrelated to the synchronous, JWT-based path every application already
  gets for free.

**Delete — correction found:** ADR 0030 lists both `PATCH` and `DELETE` on
`/applications/{appSlug}`, but with `status` already covering `active`/`suspended`/`deleted`
(mirroring `account`/`tenant`), a separate hard-delete method is redundant and inconsistent with
how every other lifecycle-bearing actor in this design is treated (never destructively remove,
flip status). **Fix:** `DELETE` is a soft alias for `PATCH { status: "deleted" }` — same effect
(tower's portcullis-bundle view actor stops including it, Story 001, so portcullis stops
recognizing its hosts), not a literal row removal. Preserves audit history, consistent with
`account`/`tenant`.

### Identity & Access section

**Providers** (tenant-wide credential catalog, ADR 0016) — list, add (`discoveryUrl`,
`clientId`, `clientSecret` — write-only, never redisplayed), edit non-secret fields, rotate
secret, remove. Each entry shows its live discovery status inline ("healthy" / "discovery
failing since {checkedAt}") — resolved by
[ADR 0073](0073-provider-discovery-status-feedback.md), which closed the gap this section
originally flagged (no feedback loop from portcullis's discovery failures back to any
admin-visible status).

**Role Definitions** (ADR 0047) — list (filterable by scope/status), create (`name`, scope
picker — tenant-wide or a specific application from the Applications list, `description`),
retire (not delete). **Correction found:** ADR 0047's route used a generic `{id}` without
stating its relationship to the actor's own composite business key
(`{tenant}:{scope}:{name}`). Fix: the route's `{id}` **is** that key, URL-encoded — not a
separate generated identifier, keeping the API consistent with treating it as the actor's real
business key rather than inventing a redundant one.

**Accounts** — list/search, status (`PATCH`), roles (add validated against an active
`roleDefinition`, ADR 0047; remove), permissions (add/remove — see catalog below).
**Correction found:** `account.searchableBy` (ADR 0017) still listed `profile.email`, a field
ADR 0023 removed entirely when it replaced `account.profile` with `account.contactId` for PII
isolation — this reference is stale. Fix: `searchableBy: ['tenant', 'contactId', 'status']`.
Email search works as `GET /tenants/{tenantSlug}/accounts?email=...`, with tower computing the
HMAC and resolving to `contactId` **internally** (ADR 0023) — nothing outside tower ever needs
to know the hashing scheme exists. **UI principle:** the Accounts screen does not show email/
name inline — that's `contactId`-gated PII, a separate, narrower `contacts:read` permission
(ADR 0030). An admin holding it sees a "view contact info" action that calls the `/contacts/
{contactId}` endpoint directly; an admin without it doesn't see the option at all. The backend
permission separation ADR 0030 already established must actually be honored in the UI, not
bypassed by joining the data anyway because the screen happens to have access to `contactId`.

**Invites & Invite Codes** — admin-facing list + create + revoke, as originally scoped.
**Clarification found:** ADR 0019 explicitly designed invite-code issuance as *not*
admin-exclusive (the "referral-enabled regular user" case) — but `_admin` is gated behind
admin-level access by its very nature (ADR 0044/0049), which a referring end-user has no reason
to hold. This screen in `_admin` is specifically the **admin-oversight view** (see and manage
every code issued tenant-wide, typically by admins with broad scope/`maxOutstanding`). The
end-user self-service case ("invite a friend") is a separate, already-anticipated embeddable
Web Component (ADR 0044's widget list already named "invite management") calling the *same*
tower endpoint (`POST /tenants/{tenantSlug}/invite-codes`) from inside the tenant's own product
UI — not designed in detail here, just confirmed as the right home for that case so it isn't
mistakenly folded into `_admin`. **Designed in full by
[ADR 0071](0071-self-service-widget-data-access.md)/[ADR 0072](0072-embeddable-web-component-inventory.md):**
`<authstar-invite-widget>`, calling the caller-scoped `/_authstar/me/invite-codes`.

### Consolidated `permissions` catalog — a finding worth fixing now

Granting a permission needs a real, complete list to build a dropdown from. Checking across
every ADR that introduced a `permissions` grant string turned up no single canonical list —
each was introduced locally as its own route was designed (ADR 0017's own framing: `permissions`
is meant to be "a closed, tower-defined vocabulary," but it was never actually consolidated).
Fixing this is a documentation task, not a new mechanism — a runtime discovery endpoint would
be over-engineering for a small, slow-changing, admin-tool-only need:

| Grant | Introduced by | Scope shape |
|---|---|---|
| `applications:manage` | ADR 0030 | `tenant` |
| `accounts:manage` | *new, filling a gap* — account status changes | `tenant` |
| `roles:manage` | ADR 0047 | `tenant` |
| `permissions:manage` | *new, filling a gap* — granting permissions to other accounts is more sensitive than granting product roles and warrants its own grant, not folded into `roles:manage` | `tenant` |
| `contacts:read` | ADR 0030 | `tenant` |
| `invite:send` | ADR 0018/0019 | `tenant` or `{application}` |
| `invite:code:issue` | ADR 0019 | `tenant` or `{application}`, plus `maxOutstanding` |
| `providers:manage` | ADR 0016/0030 | `tenant` |
| `billing:manage` | ADR 0019 (example), ADR 0046 (actual) | `tenant` |
| `communication-types:manage` | ADR 0034 | `tenant` |
| `communications:read` | ADR 0034 | `tenant` |
| `opt-outs:manage` | ADR 0034 | `tenant` |
| `sending-config:manage` | ADR 0049 | `tenant` |
| `billing:manage` (stripe-config) | ADR 0052 | `tenant` |
| `erasure-requests:read` | ADR 0055 | `tenant` — deliberately narrower than `contacts:read`; erasure-request records carry no PII |
| `contacts:export` | ADR 0056 | `tenant` — distinct from and broader than `contacts:read`; aggregating a full cross-service export is more sensitive than the contact-detail view alone |
| `analytics:read` | ADR 0059 | `tenant` — gates chronicle's report and query endpoints; the only section with no permission entry until this pass |
| `activity:read` | ADR 0060 | `tenant` — deliberately coarse, one gate for the merged tower/keep/herald activity feed, not per-entry filtering |
| `billing:read` | ADR 0060 | `tenant` — distinct from `billing:manage`; viewing a revenue summary shouldn't require the ability to edit plans/Stripe config |
| `tenant:manage` | ADR 0062 | `tenant` — `name`/`cookie` edits and the restricted `active → suspended` transition only; reactivation and deletion are unreachable through any tenant-scoped permission, operator-only |
| `suppressions:manage` | ADR 0074 | `tenant` — herald's bounce/complaint-driven suppression list; one grant for read and write, same posture as `opt-outs:manage` |

Treated as the canonical list going forward — a new route added later should draw from this
table or extend it deliberately, not invent a grant string in isolation the way prior ADRs did.

## Consequences

- Tower's application write path gains the `publicUrl`-in-`hosts` validation.
- Application `DELETE` becomes a soft alias for a status change, not a row removal.
- `account.searchableBy` is corrected; tower's accounts list route gains server-side email
  resolution via the existing `contact` HMAC mechanism.
- `roleDefinition`'s route `{id}` is clarified as the actor's own composite key.
- Two new permission grants (`accounts:manage`, `permissions:manage`) fill gaps the
  consolidated catalog surfaced.
- Provider discovery status feedback is resolved by [ADR 0073](0073-provider-discovery-status-feedback.md).

## Related

- [ADR 0016](0016-application-layer-and-sso-scope.md), [ADR 0017](0017-account-identity-and-role-model.md), [ADR 0018](0018-trial-roles-and-keep-boundary.md), [ADR 0019](0019-invite-codes.md), [ADR 0020](0020-tenant-application-actors-and-secret-handling.md), [ADR 0023](0023-pii-isolation-via-hashed-contact-records.md), [ADR 0030](0030-tower-api-surface.md), [ADR 0044](0044-web-surfaces-and-distribution-model.md), [ADR 0047](0047-application-and-role-slug-validation.md), [ADR 0049](0049-web-admin-information-architecture.md), [ADR 0050](0050-portal-reserved-application.md)

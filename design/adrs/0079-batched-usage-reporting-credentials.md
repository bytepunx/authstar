---
id: ADR-0079
title: Durable Credentials for Batched Usage Reporting
status: accepted
date: 2026-08-02
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0079: Durable Credentials for Batched Usage Reporting

- **Status:** Accepted
- **Date:** 2026-08-02
- **Affects:** keep, portcullis, web
- **Resolves the flagged gap in:** [ADR 0043](0043-application-reported-usage-metering.md)

## Context

`/_authstar/usage` (ADR 0043) authenticates with the internal JWT the app already holds on an
inbound request — free, no new credential, but only valid for 60 seconds and only within an
active, portcullis-fronted request. An app reporting usage from a background job or a batched
process has no such request to piggyback on. ADR 0043 named this precisely and left it
unsolved: "a durable, app-held API credential issued by `keep`." No credential of this class —
authstar-issued, application-held, usable outside any live portcullis-fronted request — exists
anywhere in this design; every other application-adjacent secret (provider `clientSecret`,
signing keypairs) is tenant-scoped and never leaves signet/tower's control.

## Decision

A new, narrow credential class: keep-issued, scoped to usage reporting only.

### A new, narrow credential class: keep-issued, scoped to usage reporting only

Deliberately narrow blast radius — this credential can report usage and nothing else, not a
general-purpose application API key. New keep actor:

```ts
{ tenant: '', application: '', credentialId: '', hashedSecret: '',
  status: 'active' | 'revoked', createdAt: '' }
```

Keep generates a high-entropy secret at creation time, returns it **once** in the creation
response, and stores only a salted hash — the same discipline every credential in this design
follows, just via hashing rather than signet, since this is fundamentally different from every
other secret here: it's held by an **external actor** (the adopting application's own backend),
not distributed to another authstar service via bundle. Signet's distribution model doesn't fit
a secret that's supposed to leave authstar's own trust boundary entirely; a standard generate-
hash-verify API-key pattern does.

### Issuance and revocation — `web`, reusing `applications:manage`

```
POST   /tenants/{tenantSlug}/applications/{appSlug}/usage-credentials   -- returns secret once
GET    /tenants/{tenantSlug}/applications/{appSlug}/usage-credentials   -- metadata only
DELETE /tenants/{tenantSlug}/applications/{appSlug}/usage-credentials/{credentialId}
```

Gated by the existing `applications:manage` permission — no new grant; this is squarely another
piece of application-level operational config, the same category as hosts/upstream/CORS. Multiple
concurrent credentials per application are allowed, deliberately — rotation is "create the new
one, confirm it works, delete the old one," not a single-active-credential model that would force
a downtime window mid-rotation. `web`'s Applications section (ADR 0051) gains a small sub-section
for this, alongside the existing config groups.

### Reporting — a new, exempt reserved path, not a new keep ingress

`POST /_authstar/usage-reports` — a new portcullis reserved path, distinct from the existing
`/_authstar/usage`. Unlike every other `/_authstar/*` path, this one is **exempt** from the
normal session/internal-JWT gate (Story 013) — the same posture as the Stripe/SES webhook paths,
since the caller here has no session and no internal JWT, only this credential. Portcullis still
resolves tenant/application from `Host` first (the same first step every request gets) and
proxies to `keep` over SPIFFE mTLS, same connection as every other portcullis→keep call — this
reuses existing routing infrastructure rather than standing up a second, publicly-reachable keep
ingress the way [ADR 0067](0067-tenant-creation-and-provisioning.md)'s pre-tenant case needed
(that case had no tenant/Host to resolve at all; this one does).

Keep performs its own authentication: verifies `Authorization: Bearer <credential>` against the
stored hash, and **cross-checks that the credential's own `tenant`/`application` match what
portcullis resolved from `Host`** — a mismatch is rejected outright. This is defense in depth,
not the primary authorization (the credential hash check is), but it closes an otherwise-open
door: a leaked credential for one application couldn't be replayed against a different
application's host and have keep silently accept it.

### Converges on the exact same recording logic as the synchronous path

Both `/_authstar/usage` (JWT-authenticated, synchronous, in-request) and
`/_authstar/usage-reports` (credential-authenticated, batched) resolve to the same underlying
`usageRecord` creation, meter validation, and `entitlement.usage-updated` publishing ADR 0043
already designed — two ingress/auth paths, one handler. No divergent behavior downstream of
authentication.

## Consequences

- New keep actor and three new routes, reusing `applications:manage`.
- New portcullis reserved, exempt path (`/_authstar/usage-reports`) and story.
- `web`'s Applications section gains a credential-management sub-section.
- No new keep ingress — reuses the existing portcullis→keep SPIFFE mTLS connection.

## Related

- [ADR 0016](0016-application-layer-and-sso-scope.md), [ADR 0020](0020-tenant-application-actors-and-secret-handling.md), [ADR 0030](0030-tower-api-surface.md), [ADR 0041](0041-keep-api-surface.md), [ADR 0043](0043-application-reported-usage-metering.md), [ADR 0051](0051-web-applications-and-identity-access-screens.md), [ADR 0067](0067-tenant-creation-and-provisioning.md)

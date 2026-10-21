---
id: ADR-0094
title: Adopting an Already-Provisioned Tenant
status: accepted
date: 2026-08-21
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0094: Adopting an Already-Provisioned Tenant

- **Status:** Accepted
- **Date:** 2026-08-21
- **Affects:** tower
- **Related:** [ADR 0067](0067-tenant-creation-and-provisioning.md), [ADR 0093](0093-domain-pending-tenant-provisioning.md)

## Context

`bytepunx` (argo/loci/fabledrifter/writingdesk) was cut over from the old single-binary
`authstar-proxy` to portcullis by hand-authoring its tenant config directly into
`cluster-secrets` -- deliberately, at the time, since tower's own provisioning flow didn't exist
yet in a usable form and the cutover needed the old proxy's exact flat `.bytepunx.com`
shared-SSO cookie shape. Its signing keys and secret names were chosen to already match tower's
own naming convention (`tenant-bytepunx-session-key`, etc.) specifically so a later
reconciliation could adopt them -- but no such reconciliation path was ever built
(bytepunx/authstar-tower#3's own blocker comment: tower has zero rows for this tenant).

Running `POST /tenants` for `bytepunx` today would not be a no-op retry -- it would push four
brand-new secrets (overwriting the live session/internal signing keys, invalidating every
already-authenticated session) and `patchConfig`'s `jsonPatchAdd('/tenants/bytepunx', {...})`
would replace the *entire* hand-authored tenant object in portcullis's bundle in one shot
(RFC 6902 "add" is upsert-on-existing-key), wiping argo/fabledrifter/writingdesk's routing
entries along with it. `provisioning.ts`'s whole design assumes the tenant it's creating has
never existed anywhere before; there was no path for "this tenant already exists and is already
correct, tower just doesn't know about it yet."

## Decision

A new operator-only route, `POST /operator/tenants/:tenantSlug/adopt`, registers a tenant in
tower's own actor store to reflect an already-complete, already-correct external state --
without ever calling `signetAdmin.pushSecret` or `patchConfig`. Body: `{ name, domain,
cookieDomain, adminEmail, provider: { name, clientId, discoveryUrl, scope } }`.

Sequence:
1. Validate slug/domain the same way `POST /tenants` does (shared helpers, extracted into
   `lib/tenant-validation.ts` so the two routes can't drift against each other).
2. Reject if the tenant already exists in tower, or if the domain is already claimed by another
   tenant.
3. Resolve `adminContactId` via `contactStore.upsert`, same PII-isolation convention as ordinary
   creation.
4. `tenant.create` -- writes tower's own event log only, no signet call.
5. `tenant.mark-secrets-provisioned` / `tenant.mark-portcullis-registered` -- flip the flags
   `POST /tenants` would otherwise set only after actually pushing to signet. For an adopted
   tenant these flags mean exactly the same thing (the secrets and portcullis config already
   exist), just without tower itself having been the one to write them.
6. `provider.create` (+ `tenant.add-provider` mirror) for the given provider -- also tower-only
   bookkeeping, no signet call.

`cookieDomain` is a separate field from `domain`, not derived from it -- bytepunx's real cookie
domain is the dot-prefixed `.bytepunx.com` (flat shared-SSO across every subdomain), distinct
from the tenant's own bare `bytepunx.com`.

## What adoption deliberately does not do

- **No `_admin` application, no portcullis registration call, no first-admin invite.** Those are
  `completeDomainDependentProvisioning`'s job for a *new* tenant; an adopted tenant's portcullis
  config is already complete and already correct, and touching it at all reintroduces exactly
  the destructive-overwrite risk this route exists to avoid. Standing up an admin console for an
  adopted tenant (`authstar.<domain>`) is a separate, later decision if wanted -- not part of
  adoption itself.
- **No changes to portcullis's per-application routing config** (`hosts`/`upstream`/`exempt`/
  `cors`/`auth`). This was never tower's job for *any* tenant, adopted or not --
  `application_actor.ts`'s own header comment is explicit that these are "portcullis-routing-
  config concerns" outside `ApplicationState`'s scope, since ADR 0047's actual driver (keep's
  role-reference cache) only needs to know whether an application slug exists and is active.
  Registering an application in tower after adoption (e.g. `loci`, for role-definition scoping)
  is pure tower-side bookkeeping and has zero portcullis blast radius -- confirmed directly:
  `routes/applications.ts`'s create handler never calls `signetAdmin` at all.

## Consequences

- **tower**: new `POST /operator/tenants/:tenantSlug/adopt` route
  (`src/routes/adopt-tenant.ts`); `validateDomain`/`domainAlreadyTaken`/`fetchState`/
  `RESERVED_WORD`/`SLUG_PATTERN` extracted from `routes/provisioning.ts` into
  `lib/tenant-validation.ts`, shared by both routes.
- **cluster-secrets**: unchanged by this ADR -- bytepunx's hand-authored portcullis config stays
  exactly as it is, including the loci/argo/fabledrifter/writingdesk routing blocks. This ADR
  only closes the "tower doesn't know this tenant exists" gap, not the (permanent, by-design)
  fact that per-application routing config lives outside tower's model.
- Unblocks `bytepunx/authstar-tower#3` (loci role definitions require the `bytepunx` tenant to
  exist in tower first) and, transitively, `bytepunx/authstar-keep#1`.

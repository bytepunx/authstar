---
id: ADR-0068
title: Tenant Creation UI — `web`'s Public Signup Page and `steward`'s Create-Tenant Screen
status: accepted
date: 2026-08-01
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0068: Tenant Creation UI — `web`'s Public Signup Page and `steward`'s Create-Tenant Screen

- **Status:** Accepted
- **Date:** 2026-08-01
- **Affects:** web, steward
- **Depends on:** [ADR 0067](0067-tenant-creation-and-provisioning.md)

## Context

ADR 0067 designed the mechanism (`POST /tenants` on tower's own direct, pre-tenant ingress).
Both callers named there — a self-service signer-upper and an operator via `steward` — need an
actual UI. Both are genuinely new *kinds* of surface: `web`'s existing three (ADR 0044) are all
tenant-scoped and reached through portcullis; this one, by definition, has no tenant yet and
nothing to resolve. `steward` already has the right access pattern (direct, bearer-token, no
portcullis) — it just needs a new screen.

## Decision

`web` gains a fourth surface: an installation-level, pre-tenant public signup page.

### `web` gains a fourth surface: an installation-level, pre-tenant public signup page

Reachable at a **fixed, non-tenant host** (e.g. `signup.{baseDomain}`) that is not one of the
per-tenant hosts portcullis resolves at all — DNS points it straight at `web`'s own ingress,
bypassing portcullis entirely, for the same reason tower's `POST /tenants` bypasses it (ADR
0067): there is no tenant to resolve yet, and portcullis's entire gate (Story 013) is built
tenant-first. This is a deliberate, narrow exception to ADR 0044's "portcullis proxies every
`web` page" pattern (ADR 0066) — the one page that structurally cannot go through it.

The page collects `name`, `slug` (client-side format hint, real uniqueness check happens
server-side on submit — no separate availability-check endpoint, since a race between check and
submit would still need the same server-side validation anyway), and `adminEmail`. It submits
**directly** to tower's direct ingress — the only place in this entire design where `web` calls
a backend service without an internal JWT or any portcullis mediation at all, because there is
no session and no portcullis hop in this path. Tower's direct ingress needs CORS configured
specifically for this signup host (and no other origin) to allow the browser call.

On success: a confirmation screen ("check your email to finish setting up your account") — no
auto-login, no session issued here. The admin's actual first authentication is the ordinary
invite-redemption OIDC flow ADR 0021 already established, unchanged. This keeps the signup page
itself from needing to handle any identity/session concern at all — it only ever creates the
tenant and triggers the existing invite mechanism.

### `steward` gains a Create Tenant screen — same endpoint, operator auth path

Consistent with `steward`'s existing direct, bearer-token reachability to tower (ADR 0045),
this is simply a new form calling the same `POST /tenants`, authenticated with the operator
token instead of anonymously. Fields: `slug`, `name`, `adminEmail`, and an optional `_admin` host
override (self-service callers never get this field — ADR 0067 — but an operator provisioning a
tenant with domain infrastructure already in place should be able to set it at creation instead
of editing it afterward). Same confirmation outcome; this is `steward`'s entry point into the
gap both ADR 0021 and ADR 0048 explicitly left open.

### Corrections to prior ADRs

ADR 0021's "Explicitly out of scope" section and ADR 0048's "Explicitly not designed here"
section both named tenant creation as unresolved — both get a pointer note to ADR 0067/0068
rather than being rewritten, consistent with how this design records resolved gaps elsewhere.

## Consequences

- `web` needs a route/page outside its normal per-tenant `_admin` serving path, and a build-time
  or config-time known "signup host" distinct from any tenant's hosts.
- Tower's direct ingress needs CORS enabled for exactly that host.
- `steward` gains one new screen; no new access pattern.
- ADR 0021 and ADR 0048 get pointer notes.

## Related

- [ADR 0021](0021-cli-operator-bootstrap.md), [ADR 0044](0044-web-surfaces-and-distribution-model.md), [ADR 0045](0045-steward-operator-console.md), [ADR 0048](0048-steward-ux.md), [ADR 0066](0066-portcullis-proxies-branded-pages-to-web.md), [ADR 0067](0067-tenant-creation-and-provisioning.md)

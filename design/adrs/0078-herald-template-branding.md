---
id: ADR-0078
title: Per-Tenant/Per-Application Template Branding
status: accepted
date: 2026-08-02
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0078: Per-Tenant/Per-Application Template Branding

- **Status:** Accepted
- **Date:** 2026-08-02
- **Affects:** herald, tower
- **Resolves the deferred item in:** [ADR 0022](0022-herald-communications-service.md)

## Context

ADR 0025 already gives templates a versioned shape and `templateData` a defined role (the
per-send variable payload, encrypted end-to-end) — but never names a rendering mechanism or
what `templateData` is actually expected to contain, and `template` itself has no `application`
dimension even though `communication` already carries `application` on every record. The
deferred goal — "Math Overflow's emails look like Math Overflow, not generic authstar" —
doesn't actually need a rendering pipeline built from scratch; it needs these two gaps closed.

## Decision

Rendering: logic-less variable substitution, not a scripting language.

### Rendering: logic-less variable substitution, not a scripting language

`subjectTemplate`/`bodyTemplate` (ADR 0025) are rendered against `templateData` using
mustache-style `{{variable}}` substitution — no embedded logic, no arbitrary code execution.
Deliberate, not just simplest-available: templates are tenant-authored content rendered
server-side with data the tenant doesn't fully control the shape of; a logic-less substitution
engine has no template-injection surface beyond "the wrong text appears," where a scripting-
capable engine (helpers, conditionals with side effects, etc.) would be a meaningfully larger
attack surface for very little templating power this use case actually needs.

### Branding rides in `templateData` — no new encryption boundary, no new herald dependency

Herald never gains a live call to tower for tenant/application context — that would reintroduce
exactly the kind of render-time cross-service dependency this design has avoided everywhere else
(the same reasoning ADR 0066 already gave for `/oauth2/select`). Instead, the **publisher**
(almost always tower, which already holds `tenant.branding` and, per below, `application.branding`
in its own event-sourced state) includes branding fields in `templateData` at publish time —
already part of the existing encrypted payload (ADR 0025), not a new field or new mechanism:

```ts
templateData: {
  tenant: { name: '', branding: { /* ADR 0066's existing shape */ } },
  application: { name: '', branding: { /* falls back to tenant's if unset */ } },
  ...type-specific fields (invite link, amount, etc.), unchanged
}
```

A template author references `{{tenant.branding.logoUrl}}`/`{{application.name}}`/etc. like any
other variable — branding isn't a special case in the rendering engine at all, just a
convention for what publishers populate.

### `application` gains an optional `branding` override

New nullable field on the `application` actor (ADR 0020), same override shape and reasoning as
`template.tenant: null` (ADR 0025) — unset means "use the tenant's branding," set means "this
specific application looks different." This is what actually makes the "Math Overflow vs.
PhysicsOverflow, same tenant" case work — without it, every application under one tenant would
be stuck looking identical, which is exactly the gap named. A tenant with a single product
application never needs to set this — its `tenant.branding` already *is* that product's
branding.

### `template` itself stays looked up by `(tenant, communicationType, version)` — no `application` dimension added

The branding difference is fully expressed through `templateData` variables, not through
separate template *bodies* per application. Adding an `application` axis to template lookup
would mean a tenant authoring N near-identical template copies just to swap a logo URL — the
variable-substitution approach solves the actual named problem (visual branding) without that
duplication. A tenant that genuinely wants different *copy*, not just different branding, per
application is a different, bigger ask than what was deferred here, and isn't precluded — it
just isn't what this ADR builds.

### `web` — templates screen gains a variable reference, no new IA

The existing Templates section (ADR 0054) shows the available `templateData` variables (tenant/
application branding fields, plus whatever type-specific fields that communication type defines)
alongside the template editor — not a new screen, just documentation-in-context for whoever is
authoring a template.

## Consequences

- Herald's rendering step is no longer an unspecified black box — mustache-style substitution,
  named explicitly.
- `application` (ADR 0020) gains an optional `branding` field.
- Publishers (tower, primarily) populate `templateData.tenant`/`templateData.application` at
  publish time — a small, mechanical addition to however each publisher already builds its
  send-request payload.
- No new herald dependency, no new encryption boundary — reuses ADR 0025's existing
  `templateData` encryption end-to-end.

## Related

- [ADR 0016](0016-application-layer-and-sso-scope.md), [ADR 0020](0020-tenant-application-actors-and-secret-handling.md), [ADR 0022](0022-herald-communications-service.md), [ADR 0025](0025-versioned-templates-and-encrypted-payloads.md), [ADR 0054](0054-web-billing-and-communications-screens.md), [ADR 0066](0066-portcullis-proxies-branded-pages-to-web.md)

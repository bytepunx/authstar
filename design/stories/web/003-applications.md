# Story 003 — Applications

**Epic:** Admin App
**Repo:** web
**Status:** Draft
**New — web's side of the screens [ADR 0051](../../decisions/0051-web-applications-and-identity-access-screens.md)
already specifies.** Per [ADR 0051](../../decisions/0051-web-applications-and-identity-access-screens.md),
[ADR 0079](../../decisions/0079-batched-usage-reporting-credentials.md).
**Depends on:** [tower Story 004](../tower/004-applications-and-providers.md)'s application
routes, [keep Story 005](../keep/005-usage-records-and-credentials.md)'s usage-credential
routes. Gated by `applications:manage` throughout ([Story 001](001-app-shell-auth-and-section-gating.md)).

---

## List

- [ ] `slug`, `name`, `hosts`, `status` — `_admin` excluded entirely (Story 001), not filtered
      to a disabled row.
- [ ] Calls tower's `GET /tenants/{tenantSlug}/applications` — this is `tenant.applications`
      under the hood ([tower Story 001](../tower/001-actor-definitions.md)'s embedded,
      self-reconciling array), but `web` doesn't need to know or care about that — it's a
      normal list endpoint from this screen's perspective.

## Create / Edit

Sub-sectioned to match the `application` actor's own shape exactly (tower Story 001/004):

- [ ] **Basic Info** — `slug` (immutable after creation — not editable at all in the edit form,
      not merely rejected on submit), `name`, `status`.
- [ ] **Hosts** — list of hostnames; the UI designates one as **primary**, `publicUrl` is
      *derived* from it (`https://{primary}`), never independently entered — this is what keeps
      tower's own `publicUrl`-in-`hosts` validation (tower Story 004) from ever actually being hit
      in normal use; the backend check is the safety net for direct API callers, not something
      this UI should routinely trigger. Hosts that aren't subdomains of the tenant's cookie
      domain get a visible warning that the application won't get silent SSO with the tenant's
      other applications (ADR 0016).
- [ ] **Upstream** — base URL, prefix routes, timeout.
- [ ] **CORS** — allowed origins.
- [ ] **Exempt Paths** — exact and prefix-wildcard patterns.
- [ ] **Auth** — `loginUrl`, shown **read-only**, always `/oauth2/select` on this application's
      own host unless explicitly overridden to a fully custom page (a flagged future
      enhancement, not editable here).
- [ ] **Exposed Providers** — an ordered, reorderable multi-select drawn from the tenant's own
      provider catalog (Identity & Access, [Story 004](004-identity-and-access.md)) — this
      screen's own subset/ordering, not a duplicate of the tenant-wide credentials themselves.
      Submits provider **names** to tower; tower constructs the full `{tenant}:{name}` key
      internally to store on `exposedProviders` (tower Story 001/004) — this UI never
      constructs or displays the composite key.
- [ ] **Usage-Reporting Credentials** (ADR 0079) — list (metadata only: `credentialId`,
      `status`, `createdAt`), issue (shows the generated secret **once**, in a dismissible
      panel with an explicit "you won't see this again" warning — the same one-time-reveal
      pattern as every other secret in this design), revoke.

## Delete

- [ ] Calls `DELETE` — a soft alias for `PATCH { status: "deleted" }` server-side (tower Story
      004); this screen's own confirmation copy should say "deactivate" rather than "delete" if
      it wants to be honest about what actually happens, though the action label itself
      (`DELETE` button, `DELETE` verb) matching the route's own name is a reasonable UI
      convention distinct from the copy explaining its effect.

---

## Not Covered Here

- The Identity & Access section (providers, role definitions, accounts, invites) —
  [Story 004](004-identity-and-access.md).

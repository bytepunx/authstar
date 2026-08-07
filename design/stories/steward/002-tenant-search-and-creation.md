# Story 002 — Tenant Search and Creation

**Epic:** Operator Console
**Repo:** steward
**Status:** Draft
**New — steward's side of the screens [ADR 0048](../../decisions/0048-steward-ux.md)/
[ADR 0067](../../decisions/0067-tenant-creation-and-provisioning.md)/
[ADR 0068](../../decisions/0068-tenant-creation-ui-surfaces.md) already specify.**
**Depends on:** [tower Story 013](../tower/013-operator-api.md)'s `GET /operator/tenants`,
[tower Story 012](../tower/012-tenant-creation-and-provisioning.md)'s `POST /tenants`,
[tower Story 011](../tower/011-tenant-management-and-key-rotation.md)'s
`PATCH /operator/tenants/{slug}` reactivation.

---

## Tenant Search — the real landing page

- [ ] Loads immediately after Connect ([Story 001](001-connect-and-session.md)) — search/browse
      of existing tenants, paginated, searchable by `slug`/`name`, calling
      `GET /operator/tenants`.
- [ ] Each result row shows `status` — a `suspended` tenant gets a visible **Reactivate** action
      inline, calling `PATCH /operator/tenants/{slug} { status: "active" }` directly from the
      search results, no need to first enter that tenant's own context. This is the *only* path
      back for a tenant that suspended itself, since suspension locks it out of its own `_admin`
      (tower Story 011).
- [ ] Selecting a result enters that tenant's own operator context —
      [Story 003](003-tenant-operator-context.md).

---

## Create Tenant — a separate action, not folded into search

- [ ] A distinct **Create Tenant** action alongside the search box, not a "new tenant" mode of
      the search flow itself — creation and lookup are different enough operator intents to stay
      separate (ADR 0048's own correction, made when tenant creation was designed).
- [ ] Form: `slug`, `name`, `adminEmail`, and an optional `_admin` host override — the one field
      only the operator path gets (a self-service signup caller never supplies it, tower Story
      012). Calls `POST /tenants` with the operator bearer token.
- [ ] On success: a confirmation showing the generated `_admin` host (or the operator-supplied
      override) — no secrets, no invite token in the response to display (tower Story 012), just
      confirmation the invite email was dispatched.
- [ ] **Failure mid-provisioning is a real, expected case, not treated as exceptional** — tower
      Story 012 named partial-provisioning as a real possibility with no rollback. Steward's
      error state for a failed creation should say plainly which step failed (if tower's response
      says so) and that **retrying the same `slug` is the correct next action**, not "contact
      support" or "try a different slug" — retry-from-wherever-it-stopped is the designed
      recovery path, not a fallback.

---

## Not Covered Here

- The tenant operator context itself (Admin Access, OIDC Providers, Activity, Stuck Erasure
  Requests) — [Story 003](003-tenant-operator-context.md).
- The public self-service signup page — entirely `web`'s concern (ADR 0068), not steward's.

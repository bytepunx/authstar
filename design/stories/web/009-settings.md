# Story 009 — Settings

**Epic:** Admin App
**Repo:** web
**Status:** Draft
**New — web's side of the screen [ADR 0063](../../decisions/0063-web-settings-screen.md)
already specifies.** Per [ADR 0062](../../decisions/0062-tenant-status-enforcement-and-reactivation.md),
[ADR 0063](../../decisions/0063-web-settings-screen.md).
**Depends on:** [tower Story 011](../tower/011-tenant-management-and-key-rotation.md)'s
`PATCH /tenants/{tenantSlug}` — this screen's only write route.

---

## Risk-Tiered Fields

- [ ] **Low-risk, edit freely**: `name`, `cookie.maxAge`, `branding` (`name`/`logoUrl`/
      `primaryColor`) — `branding` has no more natural home elsewhere in the eight sections (it's
      a plain `tenant` field, tower Story 001), so it lives here even though it isn't called out
      explicitly by name in ADR 0063's original field list.
- [ ] **Warned**: `cookie.domain`, `cookie.secure` — changing either has real consequences
      (session portability across subdomains, whether the cookie is sent over plain HTTP) that
      aren't obviously dangerous from the field's own name; this screen shows an inline warning
      explaining the consequence *before* the change is submitted, not just on a confirmation
      dialog after the fact.
- [ ] **Heavy confirmation**: the `status` transition (`active → suspended`) — a distinct,
      separately-triggered action ("Suspend This Tenant"), not a field in the same form as
      everything else above. Confirmation copy states plainly what suspension actually does:
      every application under this tenant becomes unreachable, **including `_admin` itself** —
      the admin submitting this action is about to lock themselves out too, and the only way
      back is `steward`, entirely outside `web` (tower Story 011/ADR 0062). This isn't a
      generic "are you sure" — the specific, severe consequence needs to be stated in the
      confirmation itself.
- [ ] **`httpOnly` is not shown as an editable field at all** — not present, not disabled with an
      explanation, simply absent from this screen entirely, since there's no legitimate reason an
      authstar-issued session cookie should ever be readable by JS, not even as an operator
      override (ADR 0062).

## No Self-Service Reactivation, By Structural Absence

- [ ] Once suspended, this same Settings screen (and every other `_admin` screen) becomes
      unreachable — there is **no** "reactivate" button anywhere in `web` to design, because the
      tenant-scoped route this screen calls structurally cannot perform that transition (tower
      Story 011) even before considering that the admin can no longer reach `_admin` at all to
      try. This isn't a missing feature this story should flag as a gap — it's the deliberately
      correct absence of one.

---

## Not Covered Here

- `seatLimit` — cross-referenced from Billing (tied to plan mappings, not edited standalone
  here) rather than duplicated as its own Settings field, per ADR 0063's original scoping to
  avoid duplicating fields that already have a more natural home.
- Provider/secret management — Identity & Access ([Story 004](004-identity-and-access.md)).

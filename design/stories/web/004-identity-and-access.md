# Story 004 — Identity & Access

**Epic:** Admin App
**Repo:** web
**Status:** Draft
**New — web's side of the screens [ADR 0051](../../decisions/0051-web-applications-and-identity-access-screens.md)
already specifies.** Per [ADR 0047](../../decisions/0047-application-and-role-slug-validation.md),
[ADR 0051](../../decisions/0051-web-applications-and-identity-access-screens.md),
[ADR 0073](../../decisions/0073-provider-discovery-status-feedback.md).
**Depends on:** [tower Story 004](../tower/004-applications-and-providers.md) (providers),
[tower Story 005](../tower/005-accounts-roles-and-permissions.md) (accounts/roles/permissions),
[tower Story 006](../tower/006-role-definitions.md), [tower Story 007](../tower/007-invites-and-invite-codes.md).

---

## Providers

- [ ] List, add (`discoveryUrl`, `clientId`, `clientSecret` — write-only, never redisplayed),
      edit non-secret fields, rotate secret, remove.
- [ ] **Each entry shows its live `discoveryStatus` inline** — "healthy" or "discovery failing
      since {checkedAt}" (ADR 0073), sourced from the same `GET` response as everything else on
      this list — no separate polling or a second call to get this.
- [ ] Removal surfaces tower's own rejection reasons verbatim when blocked (still referenced by
      an active application's `exposedProviders`, or the last provider `_admin` exposes) —
      this screen doesn't duplicate those checks client-side, just displays whatever tower
      returns.

## Role Definitions

- [ ] List (filterable by scope/status), create (`name`, scope picker — tenant-wide or a
      specific application from the Applications list, `description`), retire (not delete).
- [ ] Scope picker: "Tenant-wide" or "This application" (a dropdown of the tenant's own
      applications, from [Story 003](003-applications.md)'s same application list) — the UI
      never asks the admin to type a composite key; tower constructs
      `{tenant}:{name}`/`{tenant}:{appSlug}:{name}` internally from the plain `name`+scope
      choice (tower Story 001/006).

## Accounts

- [ ] List/search, status (`PATCH`), roles (add — validated against an active `roleDefinition`,
      picked from a live dropdown sourced from the Role Definitions list above, not free text;
      remove), permissions (add/remove, from the closed catalog — a fixed dropdown of every
      grant in ADR 0051's table, never free text either).
- [ ] **Does not show email/name inline** — that's `contactId`-gated PII, a separate
      `contacts:read` permission. An admin holding it sees a "view contact info" action calling
      `/contacts/{contactId}` directly; an admin without it doesn't see the option at all. This
      is enforced by the account list's own response simply never including plaintext PII in the
      first place (tower Story 005), not by `web` choosing to hide a field it technically
      received — there's nothing to accidentally leak here.
- [ ] Email search (`?email=...`) resolves server-side via tower's HMAC lookup — this screen's
      search box is a plain text input, no indication to the admin that hashing is happening
      underneath.

## Invites & Invite Codes

- [ ] Admin-facing list + create + revoke, as originally scoped — this is the **admin-oversight
      view** (see and manage every code issued tenant-wide), not the end-user self-service case
      (that's the `<authstar-invite-widget>` embeddable component, a separate future story).
- [ ] Invite create form includes the elevated-`permissions` field **only when the account
      creating it holds `permissions:manage` itself** — an ordinary `invite:send`-only admin
      issuing a normal product invite never sees a field that could grant elevated access, since
      they couldn't submit a value there that tower would accept anyway (tower Story 005/007's
      own gating). Hiding the field is a UX kindness, not the actual security boundary.

---

## Not Covered Here

- The Applications section — [Story 003](003-applications.md).
- The end-user self-service invite-code widget — a future embeddable-widget story.

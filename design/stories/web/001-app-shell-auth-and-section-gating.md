# Story 001 — Admin App Shell, Auth, and Section Gating

**Epic:** Admin App
**Repo:** web
**Status:** Draft
**New — consolidates the admin app's foundational structure from decisions/0044–0078 into one
reference.** Per [ADR 0044](../../decisions/0044-web-surfaces-and-distribution-model.md),
[ADR 0049](../../decisions/0049-web-admin-information-architecture.md),
[ADR 0062](../../decisions/0062-tenant-status-enforcement-and-reactivation.md).
Per [tech-stack.md](../../docs/tech-stack.md)'s choice of SvelteKit 2/Svelte 5.

---

## Summary

`web`'s admin app (`_admin`) is not special-cased — it's an ordinary reserved tenant
application, authenticated via the tenant's own OIDC providers exactly like any adopting
application, gated by the authenticated account's `permissions` exactly like every backend route
already is. This story is the app-wide shell every one of the eight IA sections (their own
future stories) plugs into, not a section itself.

---

## `_admin` Is an Ordinary Application, Not a Special System

- [ ] Authenticates via `/oauth2/select` (or a specific provider's `/oauth2/{name}/login`) on
      `_admin`'s own host, exactly like any other application — no special login path, no
      bypass of the normal OIDC flow (ADR 0044).
- [ ] `web` calls tower/keep/herald/chronicle exclusively **server-side** (SvelteKit's own
      server layer, never the browser) using the forwarded internal JWT — `web` "dogfoods the
      general-purpose application-protection model rather than being special-cased around it"
      (ADR 0044). No admin screen makes a client-side fetch directly to a backend service.
- [ ] A **suspended tenant locks admins out of `_admin` too** — portcullis's gate (Story 013,
      ADR 0062) applies before application resolution, uniformly across every application under
      a suspended tenant. `web` has no special handling for this case beyond what a suspended
      session naturally produces (the request never reaches `_admin` at all); the only way back
      is `steward`, entirely outside `web`.

---

## Section Gating — per-section, not all-or-nothing

- [ ] Each of the eight top-level sections (Overview, Applications, Identity & Access, Billing,
      Communications, Analytics, Privacy & Compliance, Settings — ADR 0049) is shown or hidden in
      the app's own navigation based on whether the authenticated account's `permissions` include
      **any** grant relevant to that section — an account holding only `contacts:read` sees just
      Privacy & Compliance, not the full navigation with everything else disabled/grayed out.
      Hidden, not merely inaccessible — an account without relevant permissions shouldn't see a
      section exists at all.
- [ ] **Route-level enforcement backs the navigation-level hiding** — a direct URL visit to a
      section the account can't see redirects or shows a clear "you don't have access" state,
      never a silent 404 or a broken partial render. The actual data-fetching calls are already
      permission-gated server-side by tower/keep/herald themselves (every backend Story already
      specifies this); `web`'s own route guards are a UX improvement on top of that enforcement,
      not the enforcement itself — a route guard bug here is a broken UI, not a security hole,
      since the backend never trusted the frontend's gating to begin with.
- [ ] Sub-elements within a section can be independently gated too, not just the section as a
      whole — Overview's three tiles are the clearest case (`analytics:read`/`billing:read`/
      `activity:read`, ADR 0061, each tile independently present or absent), and Identity &
      Access's Accounts screen withholds the "view contact info" action specifically behind
      `contacts:read`, separate from the account list itself (ADR 0051).

---

## Route Structure

- [ ] One top-level route group per IA section (`/applications`, `/identity`, `/billing`,
      `/communications`, `/analytics`, `/privacy`, `/settings`, plus `/` for Overview) — **no
      ADR specifies a literal file-based route layout**; this is this story's own reasonable
      default, not a cited requirement, and can be adjusted freely without contradicting any
      design decision.
- [ ] `_admin` itself never appears in the Applications section's own list (ADR 0051) — worth
      restating here since it's a recurring point of confusion: this app manages *other*
      applications, and deliberately can't be used to "fix" its own configuration into a broken
      state.

---

## Not Covered Here

- Each of the eight sections' own screens, fields, and actions — their own future stories.
- Hosted pages (`/oauth2/select`, `/_authstar/upgrade`, `/_authstar/link/confirm`, the public
  signup page) — these are **not** part of the `_admin` app shell at all, served by `web` as a
  genuinely separate surface (ADR 0044's three/four-surface distinction) — a future story.
- The embeddable widget library — an entirely separate build target from this app (ADR 0072,
  [tech-stack.md](../../docs/tech-stack.md)), a future story.

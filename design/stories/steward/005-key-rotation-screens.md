# Story 005 — Key Rotation Screens

**Epic:** Operator Console
**Repo:** steward
**Status:** Draft
**New — steward's side of the screens [ADR 0080](../../decisions/0080-tenant-key-rotation-ceremony.md)/
[ADR 0081](../../decisions/0081-herald-key-rotation.md) already specify.**
**Depends on:** [tower Story 011](../tower/011-tenant-management-and-key-rotation.md)'s
`POST /operator/tenants/{slug}/rotate-keys`, herald's own future
`POST /operator/rotate-keys` story.

---

## Rotate Tenant Keys — within a tenant's operator context

- [ ] Reached from a tenant's own operator context (alongside Admin Access/OIDC Providers,
      [Story 003](003-tenant-operator-context.md)) — these keys are per-tenant, so this screen
      lives where the other per-tenant operator actions do.
- [ ] Operator selects which key(s) to rotate independently — `session`, `internal`,
      `identity-hash` — checkboxes, not a single "rotate everything" action, since
      [tower Story 011](../tower/011-tenant-management-and-key-rotation.md) handles them as
      genuinely independent operations within one call.
- [ ] **Heavy, multi-step confirmation** before submitting — this is the one rotation action in
      this design with a real user-facing consequence: rotating `session` starts a countdown
      toward every un-refreshed browser session eventually needing a fresh login once its cookie
      outlives the overlap window (ADR 0080). The confirmation copy should say this plainly, not
      just "are you sure."
- [ ] Calls `POST /operator/tenants/{tenantSlug}/rotate-keys { keys: [...] }`. On success, shows
      which keys were rotated and, for `identity-hash` specifically, that old generations remain
      valid until their own retention window naturally elapses — reassurance that this isn't an
      immediate cutover for anyone currently logged in.

---

## Herald Keys — steward's first installation-wide, non-tenant-scoped screen

- [ ] **Not** reached from within any tenant's context — herald's payload-encryption keypair and
      unsubscribe-signing key are installation-wide, not per-tenant (herald's own Story 001), so
      this screen lives at the top level, alongside Tenant Search and Stuck Erasure Requests, the
      first of steward's screens to work this way (ADR 0081).
- [ ] Operator selects `payload-encryption` and/or `unsubscribe-signing` independently, same
      checkbox pattern as tenant key rotation.
- [ ] **Standard confirmation, not the heavy multi-step kind** — rotating either herald key is
      non-destructive by construction (old generations stay valid; see herald's own key-rotation
      story for exactly why each one's pruning posture differs), a meaningfully lower-risk action
      than tenant session-key rotation, and the confirmation copy should reflect that difference
      rather than treating every key-rotation action as equally weighty.
- [ ] Calls `POST /operator/rotate-keys { keys: [...] }` against herald directly (not tower) —
      the one screen in steward where the backend target isn't tower or keep.

---

## Not Covered Here

- The actual rotation mechanics (generation numbering, retention windows, pruning behavior) —
  fully specified in [tower Story 011](../tower/011-tenant-management-and-key-rotation.md) and
  herald's own key-rotation ADR/future story; this story is UI only.

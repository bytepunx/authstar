# Story 007 — Invites and Invite Codes

**Epic:** Identity & Access
**Repo:** tower
**Status:** Draft
**New — tower's side of the routes [ADR 0030](../../decisions/0030-tower-api-surface.md)/
[ADR 0047](../../decisions/0047-application-and-role-slug-validation.md) already specify.**
Per [ADR 0018](../../decisions/0018-trial-roles-and-keep-boundary.md),
[ADR 0019](../../decisions/0019-invite-codes.md),
[ADR 0021](../../decisions/0021-cli-operator-bootstrap.md),
[ADR 0023](../../decisions/0023-pii-isolation-via-hashed-contact-records.md),
[ADR 0047](../../decisions/0047-application-and-role-slug-validation.md),
[ADR 0053](../../decisions/0053-lifecycle-status-consolidation.md),
[ADR 0067](../../decisions/0067-tenant-creation-and-provisioning.md),
[ADR 0082](../../decisions/0082-tower-actor-boundary-corrections.md).
**Depends on:** [Story 001](001-actor-definitions.md)'s `invite`/`inviteCode` shapes,
[Story 003](003-identity-resolution-at-login.md) (redemption is wired into that same call).

---

## Issuance and Management

### `POST /tenants/{tenantSlug}/invites` — create

- [ ] Gated by `invite:send`.
- [ ] Body: `{ contactId, application, roles, permissions, expiresAt }`. `contactId` is
      required (every invite is email-targeted — Story 001's shape has no untargeted case).
      `permissions` is accepted here specifically for the elevated-bootstrap case (ADR 0021's
      operator-issued admin invites, ADR 0067's tenant-creation first-admin invite) — an
      ordinary admin issuing a normal product invite simply omits it.
- [ ] Each entry in `roles` validated against an **active** `roleDefinition` at creation time,
      not redemption time (ADR 0047, Story 006) — fail fast.
- [ ] Publishes through herald's existing `comms.transactional.invite-sent` type (ADR 0022) —
      no new herald mechanism, reused exactly as ADR 0021/0067 already established.

### `POST /tenants/{tenantSlug}/invite-codes` — create

- [ ] Gated by `invite:code:issue` — **not** admin-exclusive (ADR 0019); any account holding
      this permission can issue one, scoped by `maxOutstanding` if set.
- [ ] Body: `{ code, application, roles, trialDurationDays, maxRedemptions, expiresAt }`.
      **No `permissions` field exists on this route at all** — a deliberate, security-relevant
      omission, not an oversight: `invite` can carry elevated `permissions` because it's
      single-recipient and admin/operator-issued; `inviteCode` is publicly shareable by design
      (ADR 0019's referral/social-distribution case), and a shareable code that could grant
      tower `permissions` to anyone who redeems it would be a real privilege-escalation surface.
      This boundary is enforced by the request schema itself, not just documentation.
- [ ] `roles` validated against an active `roleDefinition` at creation, same as `invite`.
- [ ] `key` constructed as `{tenantSlug}:{code}` (Story 001's corrected composite key) — rejects
      if that exact key already exists (`active`, `revoked`, or `expired` — same
      historical-reference-stability reasoning as `roleDefinition`/`provider`: a given tenant's
      `LAUNCH50` shouldn't mean something different to whoever encounters an old reference to it
      later).

### List / detail / revoke — both actors, same shape

- [ ] `GET /tenants/{tenantSlug}/invites` and `GET .../invite-codes` — list, filterable by
      `status` (ADR 0030).
- [ ] `GET .../invites/{token}` and `GET .../invite-codes/{code}` — detail. `{code}` is
      constructed into the full `{tenantSlug}:{code}` key internally, same pattern as `provider`'s
      route parameter (Story 004) — the caller only ever sees the bare code, never the composite
      key.
- [ ] `PATCH { status: "revoked" }` is the actual mechanism for both; `DELETE` is an alias
      (ADR 0053). Gated by the same permission that created it (`invite:send`/
      `invite:code:issue`).

---

## Redemption — wired into login-time resolution, not a `web`-facing endpoint

Neither `invite` nor `inviteCode` redemption is a route a client calls directly — both happen
**inside** [Story 003](003-identity-resolution-at-login.md)'s `POST /identities/resolve`, via an
optional request field:

```
POST /identities/resolve
{
  ...Story 003's existing fields,
  redeem: { type: 'invite', token: '' } | { type: 'inviteCode', code: '' } | undefined,
}
```

- [ ] **`invite` redemption**: look up by `token`. Reject (redemption fails, resolution still
      proceeds normally without it) unless `status === "pending"`, not expired, **and the
      resolved account's `contactId` matches `invite.contactId` exactly** — this is the
      email-match gate ADR 0018 originally specified ("single email, single use,
      email-match-gated at acceptance"), still enforced even though the field is now `contactId`
      rather than a raw email (ADR 0023). A mismatch is not an error that blocks login — the
      person still logs in normally, they just don't get the invite's grants, since the invite
      wasn't for *them*.
  - [ ] On success: append `roles` to `grantedRoles` (always permanent — `invite` has no
        `trialDurationDays` field, unlike `inviteCode`), append `permissions` if present, set
        `status: "accepted"`.
- [ ] **`inviteCode` redemption**: look up by `{tenant}:{code}`. Reject (same
      resolution-proceeds-anyway posture) unless `status === "active"`, not expired, and
      `redemptionCount < maxRedemptions`. **No email/contact match check** — there's no target
      to match against.
  - [ ] On success: append `roles` to `trialRoles` (with a computed `trialExpiresAt`) if
        `trialDurationDays` is set, otherwise to `grantedRoles` permanently — the same
        permanent-vs-trial branch ADR 0019 originally specified. Increment `redemptionCount`.
        `status` is **not** auto-transitioned to `"expired"` on exhausting `maxRedemptions` — the
        three checks above (status, expiry, count) are independently evaluated every time, per
        ADR 0019, not collapsed into a single derived status.
- [ ] Both redemption paths are evaluated **after** identity resolution/creation succeeds, using
      the resulting `accountId` — a redemption failure never blocks or unwinds the
      resolve-or-create that already happened. The response's `isNewAccount` (Story 003) is
      unaffected by redemption outcome either way.
- [ ] Response gains `redeemed: boolean` alongside Story 003's existing fields, so the caller
      knows whether the grants actually applied (distinct from whether an account was newly
      created — the two are independent facts).

---

## Not Covered Here

- **How the invite `token`/invite-code `code` actually survives from an initial link click,
  through the full OAuth2 provider round-trip, to arrive at the callback that calls
  `/identities/resolve`** — this is portcullis's own mechanism (analogous to the
  `oauth2-link-mode` cookie pattern, ADR 0070/Story 024) and isn't fully specified anywhere yet.
  Flagged here because this tower story assumes it arrives somehow, not because it's tower's
  concern to solve.
- Coupon/discount codes (`keep`'s domain entirely, ADR 0019/0039) — no tower involvement.

---

## Notes

- `roles:manage`/`permissions:manage`'s self-action exclusion (Story 005) has no bearing here —
  redemption isn't the redeemer granting themselves anything through an authorization-management
  route; it's a pre-authorized grant (validated at issuance time by someone who *did* hold the
  right permission) being applied to the account that met its redemption conditions. Different
  mechanism, doesn't need the same guard.

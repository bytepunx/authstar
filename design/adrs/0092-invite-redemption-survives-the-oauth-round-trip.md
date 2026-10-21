# ADR 0092: Invite Redemption Survives the OAuth Round Trip

- **Status:** Accepted
- **Date:** 2026-08-19
- **Affects:** portcullis, tower
- **Resolves the long-open item in:** [Story 007](../stories/tower/007-invites-and-invite-codes.md) ("Not
  Covered Here": how the invite token survives the OAuth2 round trip)
- **Related:** [ADR 0021](0021-cli-operator-bootstrap.md), [ADR 0091](0091-tenant-owned-domains-and-the-authstar-admin-surface.md)

## Context

Tower's `/identities/resolve` (called by portcullis on every successful login) already accepts
and fully applies a `redeem: {type: 'invite', token}` payload — granting the invite's
roles/permissions to the resulting account, tested, working. Nothing has ever called it with one.
Checked directly against `authstar-middleware/src/oauth/callback.rs` and `identities.rs`: there is
no invite-token handling anywhere in portcullis's login path. herald's own seed invite-sent
template already builds the intended link —
`https://{{adminHost}}/oauth2/select?invite={{token}}` — confirming the wire shape was already
decided (Story 007 punted it to portcullis, not left genuinely undesigned); it was simply never
implemented on the receiving end.

Practical consequence: no invite — the bootstrap admin invite tower auto-sends at tenant creation,
or any invite issued later — currently grants anything on redemption. The invitee logs in
successfully (an account gets created or matched) but never receives the permissions the invite
was supposed to carry. This blocks admin onboarding regardless of hosting model, and is a
prerequisite for [ADR 0091](0091-tenant-owned-domains-and-the-authstar-admin-surface.md)'s stated
goal (an operator can invite tenant admins and have it actually work) to be true.

## Decision

### `?invite=<token>` on any login-initiating request becomes a short-lived, host-only cookie

Mirrors the existing pattern already used for the parallel case: identity-linking already carries
state through the same round trip via an `oauth2-pending-link` cookie (`gate.rs`), and the general
post-login return path already does the same via `authstar-return` (`RETURN_COOKIE_NAME`). This
ADR adds a third, same-shaped cookie, `authstar-pending-invite`, set whenever a request that
initiates login (`/oauth2/select`, or a provider's own `/oauth2/{provider}/login`) carries an
`?invite=` query parameter. Same cookie properties as its siblings: host-only, short TTL (long
enough to cover a real OAuth round trip, short enough not to linger), cleared once read.

### The OAuth callback reads it back and forwards `redeem` to tower

`callback_handler` (`oauth/callback.rs`), after a successful provider token exchange and before
calling `/identities/resolve`, reads `authstar-pending-invite` if present and includes
`redeem: {type: 'invite', token}` in the resolve request body — exactly the payload
`/identities/resolve` already knows how to apply. The cookie is cleared on the response regardless
of outcome (single-attempt, matching an invite token's own single-redemption semantics on tower's
side already — a stale or already-consumed token simply fails to redeem, same as today, not a new
failure mode).

### No change when no invite is in progress

A login with no `?invite=` present behaves exactly as it does today, bit-for-bit — this is
strictly additive: read an optional cookie, forward an optional field, both absent by default.
Existing login flows (the four live `bytepunx`-tenant applications currently in production) are
unaffected by construction; this is the reasoning for why this can ship without a feature flag or
staged rollout beyond the normal test/verify/deploy cycle.

### Not addressed here

- `POST /_authstar/link/confirm`'s own pending-link mechanism (`oauth2-pending-link`) is a
  separate, already-designed feature (self-service identity linking, ADR 0070) — this ADR doesn't
  touch it, only follows its established cookie-based-round-trip-survival pattern.
- Invite-code (multi-redemption) acceptance already has its own, different UX (a code entered
  directly, not a token in a login-time query param) and isn't affected by this ADR.

## Consequences

- **portcullis**: `oauth/callback.rs` gains cookie-read + `redeem` field on the `/identities/
  resolve` call; the login-initiating handlers (`endpoints/select.rs`, provider login-redirect
  handling) gain cookie-set-from-query-param logic. Small, additive, no schema/bundle changes.
- **tower**: no changes — the receiving side is already built and tested.
- Every existing and future invite (bootstrap admin invites, ADR 0091's "invite additional admins"
  flow, ordinary product-application invites) starts actually working on redemption for the first
  time.

## Related

- [Story 007](../stories/tower/007-invites-and-invite-codes.md) (the invite mechanism and its own
  "Not Covered Here" note this resolves)
- [ADR 0021](0021-cli-operator-bootstrap.md) (the original bootstrap-invite mechanism this makes
  functional end to end)
- [ADR 0070](0070-self-service-identity-linking.md) (the sibling `oauth2-pending-link` cookie
  pattern this reuses)
- [ADR 0091](0091-tenant-owned-domains-and-the-authstar-admin-surface.md) (depends on this ADR for
  its own admin-onboarding goal to actually work)

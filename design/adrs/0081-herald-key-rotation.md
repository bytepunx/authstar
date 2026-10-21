---
id: ADR-0081
title: Herald Key Rotation
status: accepted
date: 2026-08-02
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0081: Herald Key Rotation

- **Status:** Accepted
- **Date:** 2026-08-02
- **Affects:** herald, tower, keep, portcullis, steward
- **Resolves the gap named in:** [ADR 0054](0054-web-billing-and-communications-screens.md)

## Context

[ADR 0080](0080-tenant-key-rotation-ceremony.md) closed this exact class of gap for tower's
three per-tenant keys — verification-side multi-key support existed, nothing ever produced a
second generation. Herald has the identical shape of gap for its own two keys, named explicitly
when ADR 0080 landed: the payload-encryption keypair (ADR 0025) and the unsubscribe-signing key
(ADR 0032), "system-generated and never exposed for editing... rotation, if ever needed, is an
operator/infrastructure concern," never actually designed.

Two things make this a genuinely different problem from ADR 0080, not a copy-paste:

1. **These keys are herald's own, installation-wide — not per-tenant.** Nothing about them is
   scoped to a `tenantSlug`, unlike every key ADR 0080 covered. Herald also has no operator/
   bearer-token tier at all today — ADR 0034 explicitly declined one ("herald doesn't have
   tower's bootstrap problem, so there's nothing that needs to bypass normal authorization").
   This ADR gives it one for the first time, for exactly this narrow purpose.
2. **Neither key has any existing multi-generation *verification* support**, unlike tower's keys
   (which already had `kid`/generation-based verification fully built before ADR 0080 ever
   added a producer). This ADR has to build both the producer and the verification side
   together.

## Decision

Herald joins the shared operator-token distribution, gains one narrow operator route.

### Herald joins the shared operator-token distribution, gains one narrow operator route

Extends [ADR 0045](0045-steward-operator-console.md)'s existing "one operator-token value,
distributed via signet identically to tower's, keep's, and `steward`'s own bundles" to also
include herald's bundle — the infrastructure for this was already installation-wide, herald was
simply never one of the recipients. New route, same bearer-token verification model as tower's
operator API (ADR 0021):

```
POST /operator/rotate-keys
{ keys: ('payload-encryption' | 'unsubscribe-signing')[] }
```

No `tenantSlug` in the path — these keys aren't tenant-scoped, so there's nothing to put there.

### Payload-encryption keypair — versioned, backward-compatible, pruned only when nothing references it

- Generates a new keypair, assigns it the next `payloadKeyVersion`.
- Publishes the new public key (**and** its version) to signet, distributed to every publisher
  (tower, keep, portcullis) — the exact same distribution mechanism ADR 0025 already
  established, just triggered again rather than only at herald's own initial deploy.
- `communication` gains `payloadKeyVersion`, set by the publisher at encryption time alongside
  `encryptedPayload` — this is what tells herald which private key generation to use at decrypt
  time (initial send, or a much-later on-demand re-render), the same role `kid` plays for JWT
  verification.
- New sends use the new public key immediately; already-queued or already-sent communications
  stay decryptable, since herald retains old private key generations.
- **Pruning is tied to [ADR 0029](0029-herald-payload-retention.md)'s existing purge sweep, not
  a new job.** When that scheduled sweep clears a communication's `encryptedPayload` past its
  retention window, and that was the last remaining communication referencing a given
  `payloadKeyVersion`, herald also discards that private key generation. This is a genuinely
  bounded, self-cleaning process — a key generation can only ever outlive the *longest*
  `retentionDays` of any `communicationType` that used it, and disappears automatically once
  nothing needs it, with no separate pruning ceremony to remember to run.

### Unsubscribe-signing key — versioned, verified against every retained generation, pruned only manually

- Generates a new HMAC key, assigns it the next `keyVersion`.
- New unsubscribe tokens (ADR 0032's `{tenant, contactId, category}` payload) embed `keyVersion`
  as part of the signed claim set.
- Verification selects the matching key generation by that claim, checked against **every**
  generation herald still holds — not a bounded overlap window the way session cookies or
  encrypted payloads have one.
- **Deliberately no automatic pruning, ever.** An unsubscribe link's real lifetime is however
  long it sits unclicked in someone's inbox — unlike a session cookie (bounded `maxAge`) or an
  encrypted payload (bounded `retentionDays`), there's no reliable upper bound to key this to.
  Discarding an old generation risks breaking a legitimate, not-yet-clicked unsubscribe link —
  a real compliance problem (CAN-SPAM requires a *functioning* opt-out mechanism), not just a
  broken link. Retained indefinitely by default. An operator *can* manually prune a specific old
  generation as a separate, explicit action outside the rotation ceremony itself — accepting
  that risk knowingly, not as a byproduct of routine rotation.

### `steward` gains its first installation-wide (not tenant-scoped) action

A new "Herald Keys" section, distinct from every existing `steward` screen — everything else
there operates within a selected tenant's context (ADR 0048); this is the first action that
doesn't have one. Standard confirmation, not the heavy multi-step kind ADR 0080 used for
session-key rotation — rotating either herald key here is non-destructive by construction (old
generations stay valid), so the risk profile is meaningfully lower than a tenant session-key
rotation that starts a countdown toward forced re-logins.

## Consequences

- Herald gains an operator route tree and joins the shared operator-token distribution
  (ADR 0045) for the first time.
- `communication` gains `payloadKeyVersion`.
- ADR 0029's existing purge sweep gains one additional responsibility: pruning orphaned
  payload-encryption key generations as a byproduct of its normal retention sweep.
- Unsubscribe-signing key generations accumulate indefinitely by default — a deliberate,
  named trade-off, not an oversight.
- `steward` gains its first non-tenant-scoped screen.

## Related

- [ADR 0021](0021-cli-operator-bootstrap.md), [ADR 0025](0025-versioned-templates-and-encrypted-payloads.md), [ADR 0029](0029-herald-payload-retention.md), [ADR 0032](0032-per-tenant-sending-and-can-spam.md), [ADR 0034](0034-herald-api-surface.md), [ADR 0045](0045-steward-operator-console.md), [ADR 0048](0048-steward-ux.md), [ADR 0054](0054-web-billing-and-communications-screens.md), [ADR 0080](0080-tenant-key-rotation-ceremony.md)

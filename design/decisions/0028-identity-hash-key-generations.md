# ADR 0028: Multi-Generation Identity Hash Keys with Login-Time Reconciliation

- **Status:** Accepted
- **Date:** 2026-07-25
- **Affects:** portcullis, tower
- **Refines:** [ADR 0027](0027-portcullis-computed-identity-hash.md) (addresses its flagged
  key-rotation cost)

## Context

ADR 0027 flagged rotating `identity-hash-key` as a higher-stakes operation than rotating the
contact-hash pepper — it breaks every existing identity→account lookup at once rather than
per-contact, since every future computed hash for the same `idp_sub` changes simultaneously.
This works out a concrete mechanism rather than leaving it as a named-but-unsolved cost.

This is a well-understood category of problem, not a novel one. NIST SP 800-57 formalizes the
relevant distinction as **originator usage period** vs. **recipient usage period** — a key
stops being used to produce new values well before it stops being honored for values it already
produced. The mechanism below is also the same shape as this design's own JWKS/`kid`-style
signing-key rotation, and the reconciliation trigger is the well-known **"rehash on login"**
pattern from password-hash migration (bcrypt cost-factor upgrades, algorithm changes) — the
login moment is the one point a fresh, correlatable computation is actually possible.

## Decision

### `identity-hash-key` becomes an array of generations, still portcullis-only

```ts
[{ version: 1, key: '...', effectiveFrom: '' }, { version: 2, key: '...', effectiveFrom: '' }]
```

The newest (by `effectiveFrom`) is used to produce new hashes. Older generations remain valid
to *recognize* previously-produced hashes for a **retention window that must be at least the
tenant's session `cookie.maxAge` (Story 008)** — this is the actual constraint, not an
arbitrary choice: it guarantees no in-flight session's `identityHash` can become permanently
unresolvable purely from key retirement, regardless of whether that person logs in again before
the window closes. Tower still never holds any of this key material, unchanged from ADR 0027.

### Reconciliation happens only at login (Story 006), never on ordinary enrichment calls

Story 006 is the one place portcullis holds the raw `idp_sub` before hashing and discarding it.
At that moment — and only that moment — portcullis computes candidate hashes under the current
generation *and* every generation still within the retention window, and sends them as an
**ordered list** (current first) to tower as part of identity resolution.

Ordinary enrichment calls (Story 010) are unaffected — they keep sending the single
`identityHash` already on the session JWT. Whatever tower resolved that hash to at login time
(directly, or via an alias — see below) is what continues to serve every request for the life
of that session.

### Tower tries each candidate in order; an older match creates an alias, not a rename

A match under the current candidate resolves normally. A match under a **non-current**
candidate means this is a known identity whose key generation has moved on — tower creates an
alias so **both** the old and new hash resolve to the same account, for the same retention
window as the key itself, rather than instantly renaming the record. Instant rename would break
other concurrently active sessions for the same person (a different device/browser) that
haven't hit their own login-time reconciliation yet and are still carrying the old hash. After
the retention window closes, the alias can be safely garbage-collected — no valid session could
still reference it.

## Consequences

- **Story 001** (configuration): `identity-hash-key` becomes multiple named secrets
  (`tenant-<slug>-identity-hash-key-<version>`, consistent with ADR 0014's prefixed-naming
  convention) plus a small piece of plain (non-secret) config mapping version → `effectiveFrom`,
  since that metadata needs to be readable without decrypting anything.
- **Story 006**: computes the ordered candidate list across all in-window generations, not a
  single hash, and sends it as part of login-time identity resolution specifically — not part
  of the ordinary enrichment contract.
- Tower's identity resolution needs an alias capability: multiple hash values resolving to one
  account, with its own retention/garbage-collection window mirroring the key generation's.
- The `effectiveFrom`/retention-window relationship to `cookie.maxAge` needs to be validated at
  config time — if an operator sets a key rotation more aggressive than what the retention
  window allows for, or a retention window shorter than a tenant's `cookie.maxAge`, that's a
  configuration error worth catching explicitly rather than silently risking orphaned sessions.

## Related

- [ADR 0027](0027-portcullis-computed-identity-hash.md), [ADR 0002](0002-multi-tenant-architecture-and-key-management.md) (existing `kid`-based signing key rotation, same shape)
- NIST SP 800-57 — key usage period terminology

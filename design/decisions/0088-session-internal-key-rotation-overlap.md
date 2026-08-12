# ADR 0088: Session/Internal Key Rotation-with-Overlap

- **Status:** Accepted
- **Date:** 2026-08-12
- **Affects:** portcullis, tower, authstar-config
- **Supersedes (in part):** [ADR 0080](0080-tenant-key-rotation-ceremony.md)'s Context claim
  that overlap-window verification for session/internal keys already exists, and fills in the
  mechanism its Decision section assumed but never specified.

## Context

Investigating a portcullis client-library gap (JWKS, ADR 0086/0087) surfaced a real
discrepancy: ADR 0080 states session/internal JWT verification *"already support a
`kid`-selected current key plus one still-valid prior key within a rotation overlap window
(Story 008/009)."* That's incorrect. In the actual code:

- `verify_session`'s signature (`keys: &[&EcKeyPair]`) does accept multiple keys — but its only
  call site, `gate.rs`'s `try_verify_session`, always passes a single-element slice, because
  `TenantRuntime.session_keys`/`internal_keys` are `Option<Arc<EcKeyPair>>` — exactly one key,
  ever. The multi-key-capable signature is what likely read as "overlap already supported"; it
  isn't exercised that way anywhere.
- There's no secret-naming home for a second key even if there were. Session/internal keys are
  each one fixed signet secret name (`tenant-<slug>-session-key`, `tenant-<slug>-internal-key`,
  `authstar_config::secrets::session_key_name`/`internal_key_name`) — no `-previous`/`-<version>`
  sibling, unlike identity-hash keys (ADR 0028, which *does* have real multi-generation support:
  `tenant-<slug>-identity-hash-key-<version>`, an ordered `Vec` in `IdentityHashKeys`).
- ADR 0080's own Decision text for session/internal keys ("both remain valid for verification...
  only the new one is used for signing going forward") describes exactly ADR 0028's shape, but
  session/internal keys never got that shape built for them.
- Tower's side of ADR 0080 — `POST /operator/tenants/{tenantSlug}/rotate-keys` ("tower Story
  011") — was never implemented (confirmed by grep: zero matches in tower's source). `steward`
  already has a working client calling it (`src/routes/api/tenants/[slug]/rotate-keys/+server.ts`)
  — the operator UI currently points at a route that doesn't exist.

Net effect: key rotation for session/internal keys is entirely unbuilt today, not
partially-built-but-undocumented. This ADR designs the actual mechanism, reusing ADR 0028's
already-proven shape rather than inventing a new one.

## Decision

### Session/internal keys become generation arrays, mirroring ADR 0028 exactly

```ts
// bundle, per tenant
sessionKeyGenerations: [{ version: 1, effectiveFrom: '' }, { version: 2, effectiveFrom: '' }]
internalKeyGenerations: [{ version: 1, effectiveFrom: '' }, { version: 2, effectiveFrom: '' }]
```

Same shape as `identityHashKeyGenerations` (ADR 0028), same current-generation-is-highest-version
rule, same "retention window must cover a real invariant" reasoning — just applied to two more
key purposes.

### Secret naming: the existing unversioned name stays version 1, forever — no migration

Every tenant that exists today already has `tenant-<slug>-session-key` and
`tenant-<slug>-internal-key` as fixed secret names, with no generation metadata. Renaming those
on rollout would force a coordinated secret migration across every existing tenant for a
feature most will never use. Instead:

- **Version 1 is always the existing unversioned name** (`session_key_name(tenant_slug)` /
  `internal_key_name(tenant_slug)`, unchanged). A tenant that never rotates never has
  `sessionKeyGenerations`/`internalKeyGenerations` in its bundle at all — defaults to an
  implicit single generation, version 1, at the legacy name. This is not a special case
  requiring extra code so much as it is simply *not populating the field* — the loading logic
  below treats an absent/empty generations list as `[{version: 1}]` and resolves version 1 to
  the legacy name unconditionally.
- **Version 2 and beyond use the new versioned name**: `tenant-<slug>-session-key-<version>` /
  `tenant-<slug>-internal-key-<version>`, added to `authstar_config::secrets` alongside the
  existing `identity_hash_key_name`.
- First rotation for a given tenant is therefore the only point version 2 gets created — nothing
  changes for a tenant that never rotates.

### Portcullis: hold every in-window generation per key purpose, not just one

`TenantRuntime.session_keys`/`internal_keys` change from `Option<Arc<EcKeyPair>>` to an ordered,
current-first collection — the same shape `IdentityHashKeys` already established for identity-
hash keys (`identity_hash.rs`), applied here instead of inventing a third pattern.

- **Session key**: `try_verify_session` (`gate.rs`) passes every held generation into
  `verify_session`'s existing `keys: &[&EcKeyPair]` parameter — no signature change needed
  there at all, only the call site now has more than one key to hand it.
- **Internal key**: portcullis itself never verifies the internal JWT (ADR 0030 — that's a
  downstream concern). Overlap for this key purpose is therefore not a portcullis-verification
  problem at all — it's a JWKS problem. `jwks_handler` (ADR 0086/0087) already returns a `keys`
  array; it changes from serving exactly `tenant.internal_keys`'s one key to mapping over every
  in-window generation. Every downstream consumer already does ordinary `kid`-based JWK
  selection (that's the entire point of a JWKS `keys` array) — nothing about `authstar-clients`
  or any other consumer needs to change for this to work correctly.

### Retention windows differ by key purpose, same reasoning ADR 0080 already gave

- **Session key**: must remain valid for verification until the longest-lived outstanding
  cookie signed under it could naturally expire — at least `cookie.maxAge` (default 7 days),
  identical constraint to ADR 0028's identity-hash retention rule, for the identical reason (an
  in-flight session must never become unverifiable purely from key retirement).
- **Internal key**: only needs to outlive the longest possible gap between "a token was minted"
  and "a downstream service finishes verifying it" — bounded by the token's own 60-second TTL
  plus ordinary clock skew/latency, not by anything cookie-related. A short fixed buffer (5
  minutes) comfortably covers this without being falsely precise about network conditions.
  Much shorter than the session key's window, matching ADR 0080's original "internal-token keys
  can be retired almost immediately after rotation" framing — "almost immediately" now has an
  actual number instead of being aspirational.

### Tower: actually build `POST /operator/tenants/{tenantSlug}/rotate-keys` for these two key types

Extends the route's existing (correct, already-real) identity-hash-key behavior to session/
internal keys with the same rotation shape:

1. Generate a new ES256 keypair.
2. Determine the next version (`current max version + 1`, or `2` if only the implicit version-1
   legacy generation exists).
3. Push the new secret (at its versioned name) and the updated `*KeyGenerations` array to
   portcullis's bundle via the existing elevated `SyncBundle` access (ADR 0011/0067) — same
   mechanism identity-hash rotation already uses.
4. Prune any generation past its retention window from the outgoing bundle push, at rotation
   time rather than a separate scheduled job — reusing ADR 0028/0080's already-established
   pattern, parameterized by each key purpose's own window from above.

### Config validation extends the existing rule

`authstar-config/src/validate.rs` already rejects an identity-hash retention window shorter
than `cookie.maxAge` at startup. The same check extends to `sessionKeyGenerations`'s retention
— an operator setting session-key rotation more aggressively than the tenant's `cookie.maxAge`
allows for is a startup-time configuration error, not a silent risk of prematurely invalidating
live sessions. `internalKeyGenerations` needs no equivalent check — its fixed 5-minute window
isn't operator-configurable in the way generation *count* is for the other two.

## Consequences

- `authstar-config`: `Bundle`'s per-tenant shape gains `sessionKeyGenerations`/
  `internalKeyGenerations` (optional, defaulting to the implicit version-1-at-legacy-name case);
  `secrets.rs` gains versioned name functions for both, mirroring `identity_hash_key_name`.
  `validate.rs` gains the session-key retention-vs-`cookie.maxAge` check.
- `authstar-middleware`: `TenantRuntime.session_keys`/`internal_keys` change from a single
  optional key to an ordered generations collection (new small type, mirroring
  `IdentityHashKeys`); `try_verify_session` passes all held generations; `jwks_handler` serves
  every in-window internal-key generation instead of exactly one.
- `tower`: `POST /operator/tenants/{tenantSlug}/rotate-keys` needs an actual implementation for
  the `session`/`internal` cases — currently only reachable from `steward`'s client with nothing
  on the other end.
- No change needed in `authstar-clients` or any other downstream JWT consumer — JWKS's `keys`
  array and ordinary `kid` selection already do the right thing once portcullis populates more
  than one entry.
- `ADR 0080` remains otherwise accurate (the route shape, the identity-hash-key case, the
  prune-at-rotation-time pattern) — only its claim about pre-existing session/internal
  verification support was wrong, corrected by the annotation this ADR adds there.

## Related

- [ADR 0028](0028-identity-hash-key-generations.md) (the shape this ADR reuses)
- [ADR 0080](0080-tenant-key-rotation-ceremony.md) (the route this fills in for session/internal keys)
- [ADR 0086](0086-jwks-endpoint-for-internal-jwt-verification.md) / [ADR 0087](0087-jwks-response-includes-pem-alongside-jwk-point.md) (the `keys` array this reuses for internal-key overlap)
- [ADR 0002](0002-multi-tenant-architecture-and-key-management.md) (original per-tenant key management decision)

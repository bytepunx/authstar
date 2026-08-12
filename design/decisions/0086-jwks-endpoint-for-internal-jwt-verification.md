# ADR 0086: JWKS Endpoint for Internal JWT Verification

- **Status:** Accepted
- **Date:** 2026-08-12
- **Affects:** portcullis

## Context

Every downstream service that receives the internal JWT is expected to independently
re-verify its signature (ADR 0030's "defense in depth" — a Node service checking against the
tenant's public key, not trusting portcullis's forwarding alone). `design/docs/tech-stack.md`
picked `jose` specifically for this reason: *"strong native `kid`/JWKS-set support... a better
fit than `jsonwebtoken` for a design that verifies against a resolved key selected by `kid`
everywhere."* [ADR 0002](0002-multi-tenant-architecture-and-key-management.md) goes further,
saying tenant keys should be *"discoverable via a tenant-scoped key set, with `kid` selecting
the active key during rotation"* and explicitly draws the Auth0/Okta per-tenant-key-set analogy.

None of that was ever turned into a concrete URL. No ADR or story specifies a path; a full
grep of `design/` and `ref-design/` for `well-known`/`jwks` turns up only the `tech-stack.md`
rationale above. Consequently portcullis has no JWKS-serving route at all (confirmed against
`authstar-middleware`'s source), `web`'s own `INTERNAL_JWT_JWKS_URL` sits permanently unset,
and every downstream consumer — including the `@bytepunx/authstar-*` client libraries
(`bytepunx/authstar-clients`) — is stuck distributing static public keys by hand. Filed as
[bytepunx/authstar-portcullis#2](https://github.com/bytepunx/authstar-portcullis/issues/2).

### A related, pre-existing discrepancy worth naming, not resolving here

[ADR 0080](0080-tenant-key-rotation-ceremony.md) states session/internal JWT verification
*"already support a `kid`-selected current key plus one still-valid prior key within a
rotation overlap window."* Portcullis's actual `keys.rs` says the opposite in its own doc
comment: true rotation-with-overlap *"isn't implemented, because the bundle shape only
exposes one secret name per key purpose per tenant."* This ADR doesn't resolve that
discrepancy — it only shapes the JWKS response as a `keys` array (the standard JWKS shape
regardless) so that whichever side turns out to be right, the wire format doesn't need to
change later: today it holds exactly one entry, and it holds two the moment overlap-rotation
actually lands.

## Decision

### Per-tenant, unauthenticated `GET /.well-known/jwks.json`, resolved by `Host` the same as everything else

Portcullis already resolves tenant from the request's `Host` header before any other work
happens (ADR 0002) — a JWKS request is no different. No new resolution mechanism, no tenant
slug in the path (which would require a caller to already know the mapping this endpoint
exists to publish).

```
GET https://acme.authstar.app/.well-known/jwks.json
```

`.well-known` (RFC 8615) is the standard convention every JWKS consumer (`jose` included)
already expects by default — using anything else would mean every client library needs an
explicit URL configured instead of deriving it from the tenant host, which defeats half the
point of publishing a discoverable key set at all.

### Only the internal-token key is published — never the session key

The session JWT is never independently re-verified by anything other than portcullis itself
(it's a cookie; only the party that reads cookies checks it). Publishing its public key would
be pure surface area with no consumer. Only the internal key — the one ADR 0030's "defense in
depth" is actually about — belongs in the response.

### Response shape: standard JWKS, `keys` array

```json
{
  "keys": [
    {
      "kty": "EC",
      "crv": "P-256",
      "kid": "<EcKeyPair::kid, same fingerprint already on issued tokens>",
      "use": "sig",
      "alg": "ES256",
      "x": "<base64url>",
      "y": "<base64url>"
    }
  ]
}
```

Today this array always has exactly one entry (no rotation-overlap producer exists yet, see
Context). No portcullis logic needs to change when that stops being true — the array simply
grows to two entries for the overlap window, same as any other JWKS consumer already expects.

### Implementation shape

- `EcKeyPair` (`crates/authstar-middleware/src/keys.rs`) currently retains only
  `jsonwebtoken`'s opaque `EncodingKey`/`DecodingKey` — neither exposes the raw EC point a JWK
  needs. Retain the `p256::PublicKey` (or re-derive `x`/`y` from the already-stored SPKI PEM at
  request time) and add a `to_jwk()`-shaped method.
- New route merged alongside `oauth_routes()` in `authstar-proxy/src/main.rs`, using the same
  tenant-resolution-by-`Host` path every other route already goes through. Exempt from
  authentication entirely — a JWKS endpoint that itself required a valid token to reach would
  be circular.
- Cacheable: standard `Cache-Control` headers are appropriate here (key material changes only
  at rotation, an infrequent operator-triggered event per ADR 0080) — not required for
  correctness, but avoids every downstream service hitting portcullis on every verification if
  a consumer chooses not to cache client-side. `jose`'s own `jwksKeyProvider`-equivalent
  already caches by default, so this is a defense against non-`jose` consumers, not a load
  concern for the primary client library.

## Consequences

- Portcullis gains one new unauthenticated route.
- `EcKeyPair` needs to retain or re-derive raw EC point material it currently discards after
  building `jsonwebtoken`'s key types.
- `web`'s `INTERNAL_JWT_JWKS_URL` can finally be set to `https://<tenant-host>/.well-known/jwks.json`.
- `@bytepunx/authstar-core`'s `jwksKeyProvider` (already implemented, unusable until now)
  becomes the recommended key-resolution path for every language's client library, superseding
  hand-distributed static keys.
- If/when ADR 0080's rotation-overlap claim is actually reconciled with `keys.rs`'s current
  single-key-per-purpose reality (separate work, not this ADR), no JWKS shape change is
  needed — only portcullis's population of the `keys` array changes.

## Related

- [ADR 0002](0002-multi-tenant-architecture-and-key-management.md) (tenant-scoped key
  discoverability, the `jose`/JWKS rationale this ADR fulfills)
- [ADR 0030](0030-tower-api-surface.md) ("defense in depth" — the reason downstream services
  verify the internal JWT independently at all)
- [ADR 0080](0080-tenant-key-rotation-ceremony.md) (rotation producer; the overlap-window
  discrepancy noted above)
- [bytepunx/authstar-portcullis#2](https://github.com/bytepunx/authstar-portcullis/issues/2)

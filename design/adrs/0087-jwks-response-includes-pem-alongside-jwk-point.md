---
id: ADR-0087
title: JWKS Response Includes the PEM-Encoded Public Key Alongside the JWK Point
status: accepted
date: 2026-08-12
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0087: JWKS Response Includes the PEM-Encoded Public Key Alongside the JWK Point

- **Status:** Accepted
- **Date:** 2026-08-12
- **Affects:** portcullis
- **Supersedes (in part):** [ADR 0086](0086-jwks-endpoint-for-internal-jwt-verification.md)'s
  "Response shape" and "Implementation shape" sections — the endpoint itself (URL, `Host`
  resolution, internal-key-only scope, rotation-overlap-shaped `keys` array) is unchanged and
  not re-litigated here.

## Context

ADR 0086 specified a strictly standard JWKS response: each entry carries the JWK's native EC
representation only (`kty`, `crv`, `x`, `y`, `kid`, `use`, `alg`). That's sufficient for any
consumer whose crypto/JWT library accepts a JWK directly — `jose` (this design's own choice,
per `tech-stack.md`) is exactly that.

But `bytepunx/authstar-clients` is explicitly multi-language (TypeScript today; Go, Rust,
Python, C# planned). Not every ecosystem's dominant crypto library takes a JWK as its native
input the way `jose` does — some expect a PEM- or DER-encoded public key object instead. A
client library built against one of those would have to reconstruct a public key from the
JWK's raw `x`/`y` coordinates itself (decompressing/re-encoding the EC point into whatever key
object its own crypto API needs) — and unless that reconstructed key is cached, that
conversion happens again on every single verification call, i.e. on every proxied request a
middleware handles. That's wasted, repeated cryptographic work living in N different client
implementations, each one a chance to get the point-to-key conversion subtly wrong.

Portcullis already has both representations for free. `keys.rs`'s `EcKeyPair::from_pem_bytes`
already computes a `p256::PublicKey` and its SPKI PEM encoding (`public_spki`) as an
intermediate step, before ADR 0086's own implementation notes call for retaining that same
`p256::PublicKey` again just to produce the JWK's `x`/`y`. There's no reason to hand a client
only one of the two forms when portcullis already holds both, computed once at key-load time,
never per-request.

## Decision

Each JWKS key entry carries a `publicKeyPem` member alongside the standard JWK fields.

### Each JWKS key entry carries a `publicKeyPem` member alongside the standard JWK fields

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
      "y": "<base64url>",
      "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n"
    }
  ]
}
```

`publicKeyPem` is the SPKI-encoded (X.509 `SubjectPublicKeyInfo`) PEM text for the same key the
`x`/`y` pair encodes — not a certificate, no chain, just the raw public key in the PEM shape
most non-JS crypto APIs already accept directly (Go's `x509.ParsePKIXPublicKey`, Python's
`cryptography` package, .NET's `ECDsa.ImportFromPem`, Rust's own `p256` crate this same
codebase already uses).

This is an additive, non-standard member on an otherwise-standard JWK object. RFC 7517 §4
permits unrecognized members on a JWK — a strictly spec-compliant consumer (`jose` included)
ignores it and uses `x`/`y` exactly as ADR 0086 already specified. Nothing about this changes
behavior for the client already built.

### Why both, rather than picking whichever form is "more correct"

Neither is more correct — a JWK's `x`/`y` and an SPKI PEM encode the identical EC point in two
different serializations, and different ecosystems standardize on different ones as their
crypto library's native input. Shipping both means every language's client library can consume
whichever representation is idiomatic there with zero conversion code and zero repeated
per-request derivation — the entire point of not making N client implementations each solve
"turn a JWK point into a key object" independently, with N chances to do it slightly
differently or slower than necessary.

### Both are computed once, at key-load time, not per JWKS request

`EcKeyPair` should retain both derived forms — the JWK `x`/`y` pair and the SPKI PEM string —
alongside its existing `kid`, `encoding`, and `decoding` fields, computed once in
`from_pem_bytes` (where the `p256::PublicKey` and `public_spki` already exist as locals today,
just not retained past that function). Serving a JWKS request becomes a pure read of
already-computed fields, no cryptographic work performed per-request on portcullis's side
either.

## Consequences

- `EcKeyPair` (`crates/authstar-middleware/src/keys.rs`) gains two retained fields: the JWK
  point (`x`, `y`, both base64url-encoded) and the SPKI PEM string — both derivable from data
  already computed transiently in `from_pem_bytes`, no new cryptographic operation introduced.
- The JWKS response is no longer a byte-for-byte standard JWK-only document, but remains a
  spec-compliant one (additive unrecognized member, RFC 7517 §4) — no consumer relying on
  strict `x`/`y` parsing needs to change.
- `@bytepunx/authstar-core`'s `jwksKeyProvider` can ignore `publicKeyPem` entirely (`jose`
  consumes `x`/`y` natively) — the field exists for languages that need it, not because
  TypeScript does.
- Future non-TypeScript `authstar-clients` packages (Go, Rust, Python, C#) should prefer
  `publicKeyPem` if their chosen crypto library takes PEM/DER input natively, rather than
  writing their own JWK-point-to-key-object conversion.

## Related

- [ADR 0086](0086-jwks-endpoint-for-internal-jwt-verification.md) (the endpoint this refines)
- [bytepunx/authstar-portcullis#2](https://github.com/bytepunx/authstar-portcullis/issues/2)

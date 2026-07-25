# ADR 0027: Portcullis-Computed Identity Hash Replaces `idp_sub` Storage in Tower

- **Status:** Accepted
- **Date:** 2026-07-25
- **Affects:** portcullis, tower
- **Resolves the open item in:** [ADR 0023](0023-pii-isolation-via-hashed-contact-records.md)

## Context

ADR 0023 flagged `identity`'s business key (`{tenant}:{idp}:{idp_sub}`) as retaining
pseudonymous personal data, and left open whether "pseudonym retained, directly-identifying
data erased" was a sufficient bar or whether full unlinkability (crypto-shredding, or actor
recreation) was needed. `idp_sub`, unlike email, is never needed in plaintext by tower for any
legitimate purpose — nothing reads it back out to use it the way herald needs a real email
address to send mail. That means tower doesn't need to store it at all, encrypted or otherwise
— it can simply never receive it.

## Decision

### Portcullis computes and holds the hashing key; tower never sees the raw value

A new per-tenant secret, **portcullis-only, never distributed to tower**:
`tenant-<slug>-identity-hash-key`, delivered via portcullis's single bundle (ADR 0014) the same
way its signing keys already are.

At the OIDC callback (Story 006), immediately on receiving `idp_sub` from the provider's
userinfo response, portcullis computes:

```
identityHash = HMAC-SHA256(identityHashKey, tenant + ':' + idp + ':' + idp_sub)
```

and discards the raw `idp_sub` value — it is never persisted, never placed on any token, and
never transmitted to tower.

### The session JWT carries the hash, not the raw subject

The session JWT's `idp_sub` claim (Story 008) is replaced by `identityHash`. `idp` (the
provider name, e.g. `google`) remains a separate, plain claim — it isn't sensitive on its own.
This shrinks the raw value's exposure window to portcullis's own process memory, for the brief
moment between receiving it from the provider and hashing it — it never reaches the
browser-held cookie at all, where it would otherwise sit as long as the session does.

### Enrichment calls send the hash

Story 010's enrichment request to tower carries `identityHash` in place of `idp_sub`.

### Tower's `identity` actor is keyed by the hash, with only non-sensitive fields in state

```ts
{
  actor: { identifiedBy: 'identityHash', searchableBy: ['tenant', 'idp'] },
  state: { tenant: '', idp: '', accountId: '' },
}
```

`tenant` and `idp` stay plain and searchable specifically so admins can query "all accounts for
tenant X" or "all accounts on provider Y" — a real, named use case that opaque-everything would
have lost. ("All accounts for an application" is answered via `account.roles` scope, not
`identity` — identity is tenant-scoped, not application-scoped, per ADR 0016.)

### This resolves ADR 0023's open item, not just narrows it

Since tower never collects the raw `idp_sub` in the first place, there's no "is a retained
pseudonym sufficient" question left to answer for this field — this is data minimization by
design, not erasure-after-collection. (`identityHash` itself is still, strictly, "personal
data" under GDPR's broad definition — someone holding both the tenant's key and a candidate
`idp_sub` could verify a match — but the risk is now concentrated entirely in the key's
secrecy, held only by portcullis, never distributed to tower or any other service.)

## Trade-offs

- Portcullis takes on one more piece of crypto responsibility — not much of a stretch given it
  already signs/verifies JWTs and performs PKCE computations.
- **Key rotation is higher-stakes than the contact-hash pepper (ADR 0023).** Rotating
  `identity-hash-key` changes every future computed hash for the same `idp_sub`, breaking every
  existing identity→account lookup at once — every user would need re-linking on next login
  unless a dual-key transition window is designed. Not resolved here, same category of deferred
  concern as pepper rotation, but larger blast radius (hits every user simultaneously, not
  per-contact).
- Consequent's usual convention of meaningful business keys is set aside for an opaque one — a
  stylistic departure, not a functional problem.

## Consequences

- **Story 006** (OAuth2 callback): compute `identityHash` immediately after receiving `sub`
  from userinfo; do not retain or forward the raw value.
- **Story 008** (session JWT issuance): `identityHash` claim replaces `idp_sub`; `idp` stays.
- **Story 009** (JWT verification): expose `identityHash`/`idp` to downstream use, not
  `idp_sub`.
- **Story 010** (internal JWT / enrichment call): send `identityHash` to tower's enrichment
  endpoint.
- Tower's `identity` actor (ADR 0017) is re-keyed and its state trimmed as described above.

## Related

- [ADR 0023](0023-pii-isolation-via-hashed-contact-records.md), [ADR 0017](0017-account-identity-and-role-model.md), [ADR 0001](0001-claims-enrichment-via-tower.md)

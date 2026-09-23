# ADR 0023: PII Isolation via HMAC-Hashed Contact Records

- **Status:** Accepted (extended by [ADR 0055](0055-web-privacy-compliance-screens.md))
- **Date:** 2026-07-24
- **Affects:** tower, herald

> **Extended 2026-08-01:** `web`'s Privacy & Compliance screens needed a way to go from a
> human-provided email to `contactId` (nothing below provided one) and a way to correct a typo'd
> `name` without the repoint machinery `email` changes require. See ADR 0055 —
> `GET /tenants/{tenantSlug}/contacts?email=...` (tower resolves the HMAC internally) and
> `contact.name` becomes `PATCH`-able (unlike `email`, `name` never fed the hash, so it carries
> none of the repoint complexity).
- **Corrects:** `account.profile` (ADR 0017), `identity.email` (ADR 0001/0017), `invite.email`,
  and `optOut`'s key (ADR 0022)

## Context

Consequent's event log is append-only by design — that's what makes replay and audit
trustworthy. GDPR's right to erasure needs the opposite: the ability to genuinely delete a
person's data on request. These don't reconcile by editing history; they reconcile by never
putting directly-identifying PII (email, name) into event-sourced actors in the first place.
Several actors designed so far do exactly that: `identity.email`, `account.profile.email`,
`invite.email`, and `optOut`'s plaintext-email business key.

## Decision

### `contact` — a plain, mutable, deletable Postgres row in tower, not a consequent actor

```ts
{
  id: '',        // HMAC-SHA256(tenantPepper, tenant + ':' + normalizedEmail)
  tenant: '',
  email: '',
  name: '',
}
```

- `id` doubles as the lookup key *and* the value event-sourced actors reference. It's
  deterministic: a caller who already knows the tenant and the email — and holds the tenant's
  pepper — can compute it directly, without needing standing read access to the `contact` table
  to correlate records. This is the property that keeps event-log-only access (analytics,
  audit tooling, broader internal access) from being usable to extract or enumerate real email
  addresses — only the narrowly-scoped code path that actually holds the pepper and reads the
  `contact` table can resolve a `contactId` back to a plaintext address.
- **Must be an HMAC (keyed hash), not a bare `sha256(email)`.** Email addresses have low
  entropy — a bare hash is trivially matched against a candidate list (leaked lists, common
  patterns) without ever touching the database. `tenantPepper` is a per-tenant secret, sourced
  from signet the same way every other per-tenant secret already is (ADR 0002/0014's
  prefixed-secret pattern). Rotating it is a real operational cost — every existing hash
  reference stops matching the newly-computed one — **flagged, not solved here**.
- `normalizedEmail` is lowercased/trimmed before hashing, so casing/whitespace variance doesn't
  fragment the same person into different contact records.
- Erasure = delete the row. Every event-sourced reference to that `contactId` becomes a
  permanently unresolvable pointer — the hash stays in the log (consequent's history is
  unchanged), but it resolves to nothing, and isn't practically reversible without both the
  pepper and a plausible candidate list.

### Event-sourced actors reference `contactId`, never plaintext

- `identity.email` (ADR 0001's linking hint) → `identity.contactId`. Same purpose — tower can
  still use it to suggest account-linking — now safe to hold in the event log.
- `account.profile: { email, name }` (ADR 0017) → `account.contactId`.
- `invite.email` → `invite.contactId`, created-or-reused via the same deterministic lookup —
  inviting an already-known email naturally resolves to the same contact record as their
  existing account, with no explicit linking step required.

### Changing email repoints `contactId`; it does not mutate the contact record in place

A new (or reused) contact record is created for the new email's hash, and `account.contactId`
is repointed to it — this is what produces the free, legitimately auditable
`account.contact_changed` event (old `contactId`, new `contactId`, never plaintext) mentioned
above.

### `optOut` (ADR 0022) unifies onto `contactId`

No separate hashing scheme — `optOut` keys off the same `contactId` value as `contact` and
`account`. **Consequence, not yet solved**: because `contactId` changes on email change, an
opt-out recorded against the old `contactId` does not automatically apply to the new one.
Whatever handles the email-change flow must explicitly carry forward opt-out status from the
old `contactId` to the new one, or a real anti-spam risk results (re-contacting someone who had
unsubscribed). Named as a concrete requirement for that flow's design, not resolved here.
**Resolved by [ADR 0076](0076-admin-initiated-email-change.md)**, which also builds the
repoint mechanism named just above (until then, described but never actually implemented) and
extends the carry-forward requirement to suppression records ([ADR 0074](0074-herald-bounce-complaint-and-suppression.md)),
which didn't exist yet when this was written.

## Open, Still Unaddressed

`identity`'s own business key (`{tenant}:{idp}:{idp_sub}`) still embeds `idp_sub`, which is
personal data under GDPR even though it's pseudonymous and provider-controlled. This ADR treats
"all directly-identifying data erased, pseudonym retained" as sufficient — a real choice, not
resolved by this fix, and not yet confirmed as the right bar (crypto-shredding or actor
recreation would be needed for full unlinkability, at real added complexity).

## Consequences

- Tower needs a per-tenant `contact-hash-pepper` secret, signet-managed like every other
  per-tenant secret.
- Tower gains a genuinely-mutable (non-event-sourced) `contact` table alongside its
  consequent-managed actors — a deliberate, justified exception to "everything is event-sourced"
  given PII specifically cannot be, if erasure is to actually work.
- Herald's `optOut` actor (ADR 0022) is keyed by `contactId`, not a separately-computed hash.
- Pepper rotation and the email-change-carries-opt-out-forward requirement are both named,
  deferred follow-ups.

## Related

- [ADR 0001](0001-claims-enrichment-via-tower.md), [ADR 0017](0017-account-identity-and-role-model.md), [ADR 0022](0022-herald-communications-service.md)

# Story 001 — Herald Actor Definitions

**Epic:** Domain Model
**Repo:** herald
**Status:** Draft
**New — consolidates the actor model scattered across decisions/0022–0084 into one
implementation-ready reference.** Per [tech-stack.md](../../docs/tech-stack.md)'s choice of
`consequent`/`consequent-postgres`/`fount`/`node-flakes` (shared with tower/keep) and
[tower Story 001](../tower/001-actor-definitions.md)'s established conventions.

---

## Summary

Same domain-model shape as tower and keep — `consequent` actors, `_actor.ts` files under
`./actors/`. Every shape below is the **final** form, incorporating
[ADR 0084](../../decisions/0084-herald-actor-boundary-corrections.md)'s corrections — herald was
the last of the three `consequent`-backed services to get this pass, and had the least-declared
key material of the three: no actor here ever had an explicit `identifiedBy` stated anywhere
before now.

`sending-config` is a real `consequent` actor with substantial non-secret state (provider,
addresses) alongside a write-only credential field — **not** pure secret storage the way tower's
`provider.clientSecret` or keep's `stripe-config` are. Herald's own payload-encryption keypair
and unsubscribe-signing key, by contrast, are pure signet secrets with no queryable actor at
all — covered in their own section for completeness.

---

## Conventions Every Actor Follows

Identical to [tower Story 001](../tower/001-actor-definitions.md)'s conventions — same
namespace-per-service pattern (`namespace: 'herald'`), same no-physical-delete rule, same
server-side `tenant` enforcement, same never-a-state-field rule for secrets.

---

## `communicationType`

```ts
{
  actor: { namespace: 'herald', type: 'communicationType', identifiedBy: 'key',
           searchableBy: ['tenant', 'status'] },
  state: {
    key: '',   // `${tenant}:${type}`
    type: '', tenant: '', category: 'transactional',   // transactional | marketing
    retentionDays: 30, status: 'active',                 // active | deprecated
  }
}
```

- [ ] `key` is tenant-scoped specifically because `type` is a **conventional** name (e.g.
      `"invite-sent"`) tenants are *expected* to reuse, not a value likely to be unique on its
      own — the highest-probability collision case found across the whole tower/keep/herald
      correction pass (ADR 0084).
- [ ] `category: "marketing"` is what gates CAN-SPAM footer/`List-Unsubscribe` header behavior
      (ADR 0032) — never auto-detected, never applied to `transactional` types.
- [ ] `retentionDays` (default 30) drives the scheduled purge sweep that clears
      `communication.encryptedPayload` past its deadline (ADR 0029) — a real, type-dependent
      policy difference, not one global constant.
- [ ] `DELETE` is an alias for `PATCH { status: "deprecated" }` — historical `communication`
      records referencing a deprecated type stay meaningful, never orphaned (ADR 0053).

**ADRs:** 0022 (category origin), 0025 (referenced by `template`), 0029 (`retentionDays`), 0032
(marketing-gating behavior), 0053 (`status`), 0084 (composite key, first full assembly).

---

## `template`

```ts
{
  actor: { namespace: 'herald', type: 'template', identifiedBy: 'templateId',
           searchableBy: ['tenant', 'communicationType'] },
  state: {
    communicationType: '',   // a bare type string -- see below, not a hard FK
    tenant: null,              // null = built-in/global default; set = tenant-specific override
    version: 1,
    subjectTemplate: '', bodyTemplate: '',
    createdAt: '',
  }
}
```

- [ ] `templateId` is a `node-flakes` generated id (ADR 0084) — no collision risk, same category
      as tower's `invite.token`.
- [ ] `communicationType` is a **bare type string, not `communicationType`'s own composite key**
      — templates and communication types are only loosely coupled by a shared naming
      convention, deliberately not a strict foreign-key reference, since a global-default
      template (`tenant: null`) can exist for a type string before any specific tenant has
      created their own `communicationType` row for it at all (ADR 0084).
- [ ] Editing creates a **new version** — immutable once created, no `PATCH`, no `DELETE`.
      Highest version number is implicitly current (ADR 0034), same convention as `kid`-based key
      rotation elsewhere in this design.
- [ ] Looked up by `(tenant, communicationType, version)` — deliberately gains **no**
      `application` dimension (ADR 0078): branding differences across a tenant's own applications
      are expressed through `templateData` variables at render time, not separate template
      bodies per application.

**ADRs:** 0025 (shape, origin), 0078 (rendering mechanism, lookup-key confirmation — no shape
change), 0084 (`identifiedBy` made explicit).

---

## `communication` — the minimal audit record

```ts
{
  actor: { namespace: 'herald', type: 'communication', identifiedBy: 'key' },
  state: {
    key: '',   // `${tenant}:${idempotencyKey}`
    idempotencyKey: '',   // kept as its own field too, for publisher-facing reference
    tenant: '', application: '', contactId: '',    // hash -- no plaintext PII anywhere here
    category: '', type: '', title: '',
    templateVersion: 0,
    encryptedPayload: '',                             // ciphertext of { to, templateData }
    payloadKeyVersion: 0,                               // which keypair generation encrypted this
    channel: '', status: 'pending',
    // pending | rendered | sent | delivered | bounced | failed | suppressed
    createdAt: '', sentAt: null, error: null,
    retryCount: 0, nextRetryAt: null, lastAttemptAt: null, lastError: null,
    payloadPurgedAt: null,
    providerMessageId: '',
    complainedAt: null,
  }
}
```

- [ ] `key` is tenant-scoped specifically because `idempotencyKey` is publisher-supplied, not
      internally generated — the same soft risk `usageRecord` had before its own fix (ADR
      0083/0084). `idempotencyKey` itself stays a plain field so publishers never need to know
      about the composite key.
- [ ] `status` transitions never include a bare "resend" outside `PATCH { status: "pending" }`
      (the manual-retry route, ADR 0033) — no separate action endpoint exists.
- [ ] `payloadPurgedAt` and `status` are **independent axes** — `status` describes send-lifecycle
      outcome; `payloadPurgedAt` describes payload availability. A `status: "sent"` record with
      `payloadPurgedAt` set is expected and normal once its type's `retentionDays` elapses, not
      an inconsistent state (ADR 0029).
- [ ] `retryCount`/`nextRetryAt`/`lastAttemptAt`/`lastError` are populated only by the send
      worker's own scheduled sweep (ADR 0033) — never client-writable.
- [ ] `payloadKeyVersion` is set by the **publisher** at encryption time (not herald) — tells
      herald which private-key generation to use at decrypt time, the same role `kid` plays for
      JWT verification (ADR 0081).
- [ ] `providerMessageId` and `complainedAt` are populated only via the SES/SNS webhook path
      (ADR 0074) — `providerMessageId` correlates an inbound bounce/complaint notification back
      to this record; `complainedAt` is a distinct axis from `status` for the same reason
      `payloadPurgedAt` is (a complaint happens *after* successful delivery, doesn't retroactively
      make the send not have happened).
- [ ] `status: "suppressed"` fires from **either** an opt-out check or a blanket suppression-list
      check (ADR 0074) — same value, different underlying cause; nothing on the record itself
      distinguishes which, by design (a cross-reference against `optOut`/`suppression` at read
      time answers "why," if needed).

**ADRs, in correction order:** 0025 (finalized base shape) → 0029 (`payloadPurgedAt`) → 0033
(retry fields) → 0074 (`providerMessageId`, `complainedAt`, populates `bounced`/`suppressed` for
real) → 0081 (`payloadKeyVersion`) → 0084 (composite key).

---

## `optOut`

```ts
{
  actor: { namespace: 'herald', type: 'optOut', identifiedBy: 'contactId',
           searchableBy: ['tenant'] },
  state: { tenant: '', contactId: '', optedOutCategories: [] },
}
```

- [ ] **No composite-key fix needed** — `contactId` is already an HMAC keyed by a per-tenant
      pepper (ADR 0023), cryptographically tenant-differentiated without a literal `{tenant}:`
      prefix. Same reasoning as `invite.token`'s non-correction (ADR 0082), stated explicitly
      here for the first time (ADR 0084).
- [ ] Kept in sync with `contact`'s lifecycle via two tower-published messages: `herald.contact.
      migrated { tenant, oldContactId, newContactId }` (an email change or pepper rotation —
      carries forward opted-out categories **and**, per [tower Story 008](../tower/008-contacts-erasure-and-export.md)'s
      extension, `suppression` records too) and `herald.contact.purged { tenant, contactId }`
      (an actual erasure — deletes the `optOut` record outright, no migration since there's no
      successor identity).
- [ ] Category removal (`DELETE /opt-outs/{contactId}/categories/{category}`) is a **collection
      membership operation, not a lifecycle status change** — confirmed explicitly out of scope
      for ADR 0053's `PATCH`-alias pattern (ADR 0053).

**ADRs:** 0022 (existence, original email-keyed shape), 0023 (re-keyed to `contactId`), 0024
(lifecycle sync), 0053 (category-removal clarification), 0084 (`identifiedBy` made explicit).

---

## `suppression`

```ts
{
  actor: { namespace: 'herald', type: 'suppression', identifiedBy: 'contactId',
           searchableBy: ['tenant', 'reason'] },
  state: { tenant: '', contactId: '', reason: 'hard-bounce', createdAt: '' },
  // reason: 'hard-bounce' | 'complaint' | 'manual'
}
```

- [ ] Deliberately distinct from `optOut` — blanket (every category, not category-scoped),
      system-or-admin-initiated (not recipient-initiated), exists for deliverability protection,
      not CAN-SPAM consent. The two stay separate mechanisms sharing only the `contactId` key
      (ADR 0074).
- [ ] Hard bounces and complaints both create a row here; soft bounces don't (handled entirely by
      the send worker's own transient-retry path, ADR 0033).
- [ ] Checked by the send worker **before every send attempt**, alongside the `optOut` check —
      either failing produces `status: "suppressed"` on the resulting `communication` record,
      same value as the opt-out case.
- [ ] Same bare-`contactId`-is-safe reasoning as `optOut` (ADR 0084) — no composite key needed.

**ADRs:** 0074 (sole source), 0084 (`identifiedBy` made explicit).

---

## `sending-config` — a real actor, not pure secret storage

```ts
{
  actor: { namespace: 'herald', type: 'sendingConfig', identifiedBy: 'tenant' },
  state: {
    tenant: '', provider: 'smtp',   // smtp | ses | sendgrid | ...
    fromAddress: '', fromName: '', replyTo: '', physicalAddress: '',
  }
}
```

- [ ] A true per-tenant **singleton** — keyed by bare `tenant`, confirmed correct as-is, not an
      instance of the collision risk fixed elsewhere in this story (ADR 0084).
- [ ] `credential` (SMTP password/API key) and, for API-based adapters,
      `webhookSecret` (ADR 0074, for verifying inbound SES/SNS notification signatures) are
      **never fields on this state** — write-only, pushed directly to herald's **own** signet
      bundle via `SyncBundle`, using herald's own narrow `GitOpsService`-scoped admin token (ADR
      0052) — never routed through tower, since herald (like keep) has its own admin API to
      receive the write directly.
- [ ] `physicalAddress` is a CAN-SPAM requirement, surfaced in the body footer of every
      `marketing`-category send (ADR 0032) — not optional metadata.

**ADRs:** 0032 (shape, credential), 0034 (route), 0052 (write mechanism), 0074 (`webhookSecret`
addition), 0084 (confirms the existing bare-`tenant` key needs no fix).

---

## Herald's own keys — pure signet secrets, no queryable actor

Neither key below is a `consequent` actor — both are signet-managed secrets, generated only via
[ADR 0081](../../decisions/0081-herald-key-rotation.md)'s operator route, same category as
tower's own signing keypairs.

- [ ] **Payload-encryption keypair** (ADR 0025) — public key distributed to every publisher
      (tower, keep, portcullis) via signet; private key herald-only. Rotation (ADR 0081)
      generates a new keypair with the next `payloadKeyVersion`, republishes the new public key,
      and retains old private-key generations until nothing references them — pruning piggybacks
      on the scheduled retention sweep (ADR 0029), discarding a generation exactly when the last
      `communication` referencing it has its payload purged.
- [ ] **Unsubscribe-signing key** (ADR 0032) — a dedicated HMAC key, distinct from the payload
      keypair (explicit key-separation discipline). New tokens embed `keyVersion` in the signed
      claim set; verification checks against **every** generation herald still holds, not a fixed
      overlap window. **Never automatically pruned** — an unsubscribe link's real lifetime (however
      long it sits in an inbox) has no reliable bound, and breaking one is a CAN-SPAM compliance
      problem, not just a broken link. Manual pruning of a specific old generation is a separate,
      explicit, risk-accepting operator action, never a byproduct of routine rotation.

---

## Unsubscribe Token

Stateless, signed, no database record — unsubscribing is one-shot idempotent, unlike invites.
Claim shape: `{ tenant, contactId, category, keyVersion }` — the last field added by ADR 0081 so
verification can select the right key generation. `GET /unsubscribe?token=...` shows a
confirmation page only, no side effect (protects against email-security scanners silently
prefetching links and unsubscribing real recipients who never clicked anything); `POST
/unsubscribe` performs the actual action.

---

## `templateData` Rendering

Logic-less mustache-style `{{variable}}` substitution against `subjectTemplate`/`bodyTemplate` —
no embedded logic, no conditionals (ADR 0078, chosen specifically to keep the injection surface
to "wrong text appears," not arbitrary execution). `templateData` has no formally declared
schema — a convention, not an enforced contract:

```ts
templateData: {
  tenant: { name: '', branding: { name: '', logoUrl: '', primaryColor: '' } },
  application: { name: '', branding: null },   // falls back to tenant's if unset
  // ...type-specific fields (invite link, amount, etc.)
}
```

Populated by the **publisher** (almost always tower) at publish time, already inside the
encrypted `templateData` segment — no new encryption boundary, no live herald→tower dependency
introduced to support it.

---

## Not Covered Here

- The full route inventory (methods, permission gates) — a future herald story, same pattern as
  tower's/keep's.
- The send worker's retry/backoff mechanics in detail — already specified at the ADR level (ADR
  0033), a future story wires it to these shapes.
- `tower`'s and `keep`'s own actors — their own Story 001 equivalents.

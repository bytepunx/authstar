# Story 001 — Tower Actor Definitions

**Epic:** Domain Model
**Repo:** tower
**Status:** Draft
**New — consolidates the actor model scattered across decisions/0002–0082 into one
implementation-ready reference.** Per [tech-stack.md](../../docs/tech-stack.md)'s choice of
`consequent`/`consequent-postgres`/`fount`/`node-flakes`.

---

## Summary

Tower's domain model is entirely `consequent` actors, one module per type, each file ending in
`_actor.ts` under `./actors/`. This story is the single place every actor's current, correct
shape lives — every other tower story references an actor defined here rather than repeating
its shape. Where an ADR's original shape was later corrected, only the **final** shape appears;
the ADR list under each actor names every ADR that contributed to it, in order.

`contact` is the one deliberate exception — a plain Postgres row, not a `consequent` actor,
because GDPR erasure needs a real hard delete (Story 010 covers it separately, not here).

---

## Conventions Every Actor Follows

- [ ] `namespace: 'tower'` on every actor declared here.
- [ ] `identifiedBy` is either a `node-flakes` base62 id (generated at creation — `account`,
      `application`) or a deterministic value (`identity`'s `identityHash`, computed by
      portcullis; `contact`'s HMAC; composite `{tenant}:{x}` keys for `provider`,
      `roleDefinition`, `inviteCode` — see each actor below for which).
- [ ] No actor is ever physically deleted (`contact` excepted). Every lifecycle-bearing actor
      uses a `status` field and a `PATCH`-driven transition; `DELETE` routes, where they exist,
      are soft aliases for a status change (ADR 0053).
- [ ] Every actor with a `tenant` field enforces it server-side against the caller's own
      resolved tenant on every tenant-scoped route (ADR 0030) — cross-tenant access is `404`,
      never `403`.
- [ ] Secret values (`clientSecret`, signing keys, `contact-hash-pepper`) are **never** fields
      on any actor's `state` — they exist only as signet secrets, referenced by the actor that
      owns them but never persisted in tower's own event log (ADR 0020).

---

## `tenant`

```ts
{
  actor: { namespace: 'tower', type: 'tenant', identifiedBy: 'slug', searchableBy: ['status'] },
  state: {
    slug: '', name: '', status: 'active',   // active | suspended | deleted
    cookie: { domain: '', path: '/', maxAge: 604800, httpOnly: true, secure: true },
    seatLimit: null,
    branding: { name: '', logoUrl: '', primaryColor: '' },
    createdAt: '', createdBy: '',
  }
}
```

- [ ] `httpOnly` is never editable through any route, by anyone, including the operator (ADR 0062).
- [ ] `PATCH /tenants/{slug}` permits `name`/`cookie` freely; `status` accepts **only**
      `active → suspended` (ADR 0062) — `suspended → active` and any transition to `deleted` do
      not exist on this route at all.
- [ ] Reactivation is a **different** route, operator-only, via `steward` (ADR 0062, ADR 0048).
- [ ] Key rotation (session/internal signing keypairs, `identity-hash-key` generations) is a
      **separate** operator-only route, `POST /operator/tenants/{slug}/rotate-keys` (ADR 0080)
      — not a `tenant` field at all; rotated material goes straight to signet, never through
      this actor's own state.
- [ ] `tenant.providers` **does not exist** as a state field — see `provider` below (ADR 0082).

**ADRs:** 0020 (origin), 0031 (`seatLimit`), 0064 (`branding`), 0062 (status restriction,
`httpOnly`), 0067 (creation), 0080 (rotation), 0082 (removes `providers`).

---

## `application`

```ts
{
  actor: { namespace: 'tower', type: 'application', identifiedBy: 'appId',
           searchableBy: ['tenant', 'slug', 'status'] },
  state: {
    tenant: '', slug: '', name: '', status: 'active',   // active | suspended | deleted
    hosts: [], publicUrl: '',
    upstream: { base: '', routes: {}, timeout: 30 },
    cors: { origin: [] },
    exempt: [],
    auth: { loginUrl: '/oauth2/select' },
    exposedProviders: [],   // ordered provider names/keys this application exposes
    branding: null,          // same shape as tenant.branding, nullable, falls back to tenant's
  }
}
```

- [ ] `identifiedBy` is a generated `appId`, **not** a composite of `tenant`+`slug` — `tenant`
      and `slug` are plain searchable state fields (ADR 0020). Slug uniqueness is enforced
      server-side per tenant at write time, not via the business key itself.
- [ ] `publicUrl`'s host must be present in `hosts` — validated on every write, rejecting a
      mismatch (ADR 0051).
- [ ] `DELETE` is a soft alias for `PATCH { status: "deleted" }` (ADR 0051).
- [ ] `_admin` is excluded from every applications *list* response, though it's a normal row
      like any other (ADR 0051).

**ADRs:** 0016, 0020 (origin), 0051 (corrections), 0078 (`branding`).

---

## `provider`

```ts
{
  actor: { namespace: 'tower', type: 'provider', identifiedBy: 'key',
           searchableBy: ['tenant', 'status'] },
  state: {
    key: '',            // `${tenant}:${name}`
    tenant: '', name: '',
    discoveryUrl: '', clientId: '', scope: [],
    status: 'active',    // active | removed
    discoveryStatus: { status: 'ok', checkedAt: null, error: null },
  }
}
```

- [ ] `clientSecret` is never a field here — write-only, pushed straight to signet at
      set/rotate time.
- [ ] Removal checks two things before allowing it: no active `application.exposedProviders`
      still references this key, and it isn't the last provider `_admin` exposes (ADR 0051,
      ADR 0067) — either violation rejects the write.
- [ ] `discoveryStatus` is written only by portcullis's `POST /provider-discovery-status` (ADR
      0073) — never directly editable through the tenant-scoped route.

**ADRs:** 0020 (origin, as a nested field — since corrected), 0016 (tenant-shared credentials),
0053 (`status`), 0073 (`discoveryStatus`), 0082 (promoted to its own actor).

---

## `identity`

```ts
{
  actor: { namespace: 'tower', type: 'identity', identifiedBy: 'identityHash',
           searchableBy: ['tenant', 'idp', 'accountId'] },
  state: { tenant: '', idp: '', accountId: '' },
}
```

- [ ] `identityHash` is computed **only** by portcullis (`HMAC-SHA256(identityHashKey, tenant +
      ':' + idp + ':' + idp_sub)`) — tower never sees a raw provider subject, ever, under any
      circumstance (ADR 0027).
- [ ] `searchableBy` includes `accountId` specifically so a caller can enumerate every identity
      linked to one account (needed by export, ADR 0056, and self-service linking, ADR 0070).
- [ ] Created two ways: ordinary login resolve-or-create (Story 006, unchanged since ADR 0001),
      or explicitly via `POST /identity-links` with a caller-supplied `accountId` (self-service
      linking, ADR 0070) — the latter rejects if the `identityHash` already belongs to a
      *different* account (`409`, no merge).
- [ ] Never carries `email` or any PII field — that lives only on `contact`, joined via
      `account.contactId`.

**ADRs:** 0001/0017 (original, since fully superseded), 0023 (dropped `email`), 0027 (re-keyed
to `identityHash` — the shape above), 0028 (multi-generation key reconciliation, a resolution-
time behavior, not a shape change), 0056 (`accountId` added to `searchableBy`), 0070
(`POST /identity-links`).

---

## `account`

```ts
{
  actor: { namespace: 'tower', type: 'account', identifiedBy: 'accountId',
           searchableBy: ['tenant', 'contactId', 'status'] },
  state: {
    tenant: '', contactId: '',
    status: 'active',       // active | suspended | deleted
    emailVerified: false,
    grantedRoles: [],        // { name, scope: 'tenant' | {application: ''} } — permanent
    trialRoles: [],           // same element shape — time-boxed
    trialExpiresAt: null,
    permissions: [],           // tower-owned closed vocabulary — distinct from roles (ADR 0069)
    createdAt: '',
  }
}
```

- [ ] `accountId` is a `node-flakes` generated id, not derived from anything — `tenant` is a
      plain state field, not part of the key (ADR 0017).
- [ ] `status: "deleted"` here is a **business** status (offboarding), entirely distinct from
      GDPR erasure — erasure acts on `contact`, never on `account` directly (ADR 0030).
- [ ] `grantedRoles`/`trialRoles`/`trialExpiresAt` merge into one effective role set only at
      **token-signing time**, in portcullis — tower never merges them itself (ADR 0018).
- [ ] `permissions` grants are never interpreted by tower beyond the closed catalog
      ([tech-stack.md's linked ADR 0051](../../decisions/0051-web-applications-and-identity-access-screens.md)
      — the permissions catalog table) — `roles` are opaque, app-interpreted, and tower never
      looks at what one means (ADR 0069).
- [ ] Self-action needs no `permissions` grant: any route where `{accountId}` matches the
      caller's own resolved `accountId` is permitted without a grant (ADR 0070) — only acting
      on a *different* account requires one.

**ADRs:** 0017 (origin), 0018 (`grantedRoles`/`trialRoles`/`trialExpiresAt` split), 0023
(`contactId` correction), 0051 (`searchableBy` correction), 0069 (roles-vs-permissions
closure), 0070 (self-action principle).

---

## `roleDefinition`

```ts
{
  actor: { namespace: 'tower', type: 'roleDefinition', identifiedBy: 'key' },
  state: {
    key: '',   // `${tenant}:${scope}:${name}`
    tenant: '', name: '', scope: 'tenant' | { application: '' },
    description: '', status: 'active',   // active | retired
  }
}
```

- [ ] A role must have an active `roleDefinition` before it can be granted **anywhere** —
      accounts, invites, invite codes, keep's plan mappings (ADR 0047).
- [ ] `DELETE` is an alias for `PATCH { status: "retired" }` — existing grants of an
      already-retired role stay intact (ADR 0053).

**ADRs:** 0047 (origin), 0051 (route `{id}` clarified as this exact key), 0053 (`status`).

---

## `invite`

```ts
{
  actor: { namespace: 'tower', type: 'invite', identifiedBy: 'token',
           searchableBy: ['tenant', 'contactId', 'status'] },
  state: {
    token: '', tenant: '', application: null,   // null = tenant-wide
    contactId: '',
    roles: [], permissions: [],
    status: 'pending',   // pending | accepted | revoked | expired
    expiresAt: null,
    createdAt: '', createdBy: '',
  }
}
```

- [ ] `token` is a long, high-entropy random string generated by tower — globally unique by
      construction, not composite (unlike `inviteCode`, below).
- [ ] `roles` validated against an active `roleDefinition` at **creation** time, not redemption
      time (ADR 0047).
- [ ] `permissions` is the elevated-bootstrap case only — populated when this invite grants
      admin-level access (tenant creation's first-admin invite, ADR 0067; operator-issued
      admin-access invites, ADR 0021) — empty for an ordinary invite.
- [ ] Redemption is **not** a `web`-facing endpoint — triggered internally during OIDC login
      (Story 006) when a token is carried through the flow.
- [ ] `DELETE` is an alias for `PATCH { status: "revoked" }` (ADR 0053).

**ADRs:** 0018 (existence), 0021/0067 (elevated-permissions bootstrap use), 0023 (`contactId`
correction), 0047 (`roles` validation), 0053 (status lifecycle), 0082 (full shape assembled for
the first time).

---

## `inviteCode`

```ts
{
  actor: { namespace: 'tower', type: 'inviteCode', identifiedBy: 'key',
           searchableBy: ['issuedBy', 'tenant', 'status'] },
  state: {
    key: '',   // `${tenant}:${code}`
    code: '', tenant: '', application: null, issuedBy: '',
    roles: [], trialDurationDays: null,
    maxRedemptions: null, redemptionCount: 0,
    status: 'active',    // active | revoked | expired
    expiresAt: null,
  }
}
```

- [ ] `code` itself may repeat freely **across** tenants (`LAUNCH50` under two different
      tenants is fine) — only `key` (`{tenant}:{code}`) must be unique (ADR 0082).
- [ ] Issuance gated by `invite:code:issue`, **not** admin-exclusive — a regular account can
      hold this permission with a scoped `maxOutstanding` (ADR 0019).
- [ ] `redemptionCount < maxRedemptions` and `status === "active"` and not expired, checked
      atomically — `consequent`'s per-actor command queuing serializes concurrent redemption
      attempts against the same code, so the capacity check can't race (ADR 0019).
- [ ] `DELETE` is an alias for `PATCH { status: "revoked" }` (ADR 0053).

**ADRs:** 0019 (origin), 0053 (status lifecycle), 0082 (composite key correction).

---

## `erasureRequest`

```ts
{
  actor: { namespace: 'tower', type: 'erasureRequest', identifiedBy: 'contactId',
           searchableBy: ['tenant', 'status'] },
  state: {
    tenant: '', contactId: '', requestedAt: '',
    status: 'pending', acknowledgedBy: [],   // pending | completed
  }
}
```

- [ ] `expectedServices` is **not** persisted per-record — it's tower's own fixed constant list
      (herald, keep, ...), returned alongside `acknowledgedBy` so a caller diffs the two rather
      than hardcoding the list itself (ADR 0055).
- [ ] No timeout, ever, by design — a request stays `pending` indefinitely if a service never
      acknowledges (ADR 0026). Staleness is a read-time computation in `web`/`steward`, never a
      write to this actor (ADR 0075).

**ADRs:** 0026 (origin), 0055 (list route, `expectedServices` diff), 0075 (staleness surfacing,
no shape change).

---

## `exportRequest`

```ts
{
  actor: { namespace: 'tower', type: 'exportRequest', identifiedBy: 'id' },
  state: { tenant: '', contactId: '', requestedBy: '', requestedAt: '' },
}
```

- [ ] Deliberately lightweight — no `acknowledgedBy`/`expectedServices`, since export is
      synchronous with nothing async to track (ADR 0056). `id` is a `node-flakes` generated id.

**ADRs:** 0056 (origin, unchanged since).

---

## View Actors

Two distinct views, easy to conflate — they serve different callers and aggregate different
source actors:

- [ ] **Enrichment view** — keyed by `identity`'s business key (`identityHash`), aggregates
      `identity` + `account` events into the materialized state portcullis's per-request
      claims call reads: `{ accountId, status, grantedRoles, trialRoles, trialExpiresAt,
      permissions, usage }`. `usage` is populated from keep's `entitlement.usage-updated`
      events, filtered by the resolved `application` (ADR 0017, ADR 0018, ADR 0043).
- [ ] **`portcullisBundle` view** — one per tenant, aggregates `tenant` + its `application`s +
      its `provider`s (now a real actor, ADR 0082) into the non-secret config shape portcullis's
      own bundle needs (hosts, upstream, CORS, exempt, provider metadata, cookie). A change
      triggers a `SyncBundle` push (ADR 0009/0020). **The exact mechanics of how this view
      discovers which `application`/`provider` instances belong to a given tenant are not
      resolved here** — flagged in ADR 0082 as needing its own focused pass once `consequent`'s
      actual cross-type-aggregation API is being written against directly, not before.

---

## Not Covered Here

- `contact` (Postgres row, not a `consequent` actor) — Story 010.
- Signet secrets that are *not* actors at all (`identity-hash-key` generations,
  `contact-hash-pepper`, signing keypairs) — referenced by the actors above but never modeled
  as one; see [tech-stack.md](../../docs/tech-stack.md) and ADR 0028/0067/0080 for their actual
  shape and lifecycle.
- `keep`'s and `herald`'s own actors (`subscription`, `planMapping`, `refund`, `dispute`,
  `communication`, `template`, `suppression`, ...) — each service's own Story 001 equivalent,
  not written yet.

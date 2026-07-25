# ADR 0024: Contact Lifecycle Sync to Herald; Plaintext + Hash in Send Requests

- **Status:** Accepted
- **Date:** 2026-07-24
- **Affects:** tower, herald
- **Resolves open items in:** [ADR 0023](0023-pii-isolation-via-hashed-contact-records.md)
- **Amends:** [ADR 0022](0022-herald-communications-service.md)'s message payload

## Context

ADR 0023 flagged two unresolved items: opt-out must carry forward when a `contactId` changes
(email change, or a tenant-wide pepper rotation), and herald needs some way to check opt-out
status without gaining the ability to reverse a hash back into a real address.

## Decision

### Two message types keep `optOut` in sync with `contact`'s lifecycle

Both published by tower (the `contact` table's owner), consumed by herald. They serve different
purposes and both are needed — one isn't a substitute for the other:

- **`herald.contact.migrated`** — `{ tenant, oldContactId, newContactId }`. Published whenever a
  `contactId` changes but the underlying person continues to exist: an email change (ADR 0023),
  or a pepper rotation. Herald creates an opt-out record at `newContactId`, carrying forward
  whatever categories were opted out at `oldContactId` — the exact mechanics are herald's own
  implementation detail, not specified here. Pepper rotation reuses this same message shape,
  published once per affected contact (a bulk operation, not a new message type) — this is what
  makes rotation tractable without inventing separate handling.
- **`herald.contact.purged`** — `{ tenant, contactId }`. Published on an actual erasure request,
  where the `contact` row is deleted with no successor. Herald deletes its opt-out record for
  that `contactId` outright — migration doesn't apply here, since there's no new identity for
  the preference to carry forward to.

### Communication-send requests carry both the hash and the plaintext address

ADR 0022's message payload gains `contactId` alongside `to`:

```ts
{
  contactId: '',   // hash -- used only for the opt-out lookup
  to: '',            // plaintext address -- used only for the actual send
  ...
}
```

`contactId` is used exclusively to check `optOut` (marketing category); `to` is used
exclusively for the provider API call. Herald never needs the tenant's pepper and never needs
read access to the `contact` table — every value it acts on arrives pre-resolved from the
publisher. This meaningfully shrinks herald's trust boundary: it's a pure consumer of
already-resolved values, structurally incapable of reversing a hash back to a real address,
rather than a service that has to be trusted not to.

## Consequences

- Resolves ADR 0023's "email-change-must-carry-forward-optOut" requirement and gives pepper
  rotation a concrete, tractable mechanism (bulk `contact.migrated`, not a bespoke process).
- ADR 0022's communication-request payload is updated to include `contactId`.
- Herald's own logic for applying a migration (which categories carry forward, any dedup
  handling) is left unspecified — herald's own concern when its implementation is designed.

## Related

- [ADR 0022](0022-herald-communications-service.md), [ADR 0023](0023-pii-isolation-via-hashed-contact-records.md)

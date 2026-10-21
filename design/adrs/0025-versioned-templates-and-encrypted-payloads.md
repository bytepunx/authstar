---
id: ADR-0025
title: Versioned Templates and Encrypted Payloads in Herald
status: accepted
date: 2026-07-24
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0025: Versioned Templates and Encrypted Payloads in Herald

- **Status:** Accepted
- **Date:** 2026-07-24
- **Affects:** tower, keep, portcullis (as publishers), herald
- **Supersedes:** the `communication` actor shape discussed (not yet committed) in response to
  ADR 0024's follow-up

> **Extended 2026-08-02 ([ADR 0078](0078-herald-template-branding.md)):** the rendering
> mechanism referenced only as a black-box "renders" verb below is now named explicitly
> (logic-less mustache-style substitution), and `templateData`'s expected shape gains a
> branding convention — no change to the encryption/versioning design here, just filling in
> what "renders" actually means.
>
> **Extended 2026-08-02 ([ADR 0081](0081-herald-key-rotation.md)):** the payload-encryption
> keypair below never had a rotation mechanism — now it does, and `communication` gains a
> `payloadKeyVersion` field recording which generation encrypted it.

## Context

Herald's `communication` record (ADR 0022) needs to be minimal and non-sensitive (a prior
message in this thread established that), but on-call still needs the ability to see what was
actually sent when troubleshooting — and needs to see it as it was *at the time*, since a
tenant's template for a given communication type can change after the fact. That requires
versioned templates and a way to recover the original rendered content without keeping
plaintext PII in herald's normal, broadly-queryable record.

## Decision

Publishers encrypt the sensitive segment before it ever reaches RabbitMQ.

### Publishers encrypt the sensitive segment before it ever reaches RabbitMQ

Communication-send messages (ADR 0022/0024) carry an **encrypted segment** covering everything
sensitive — `to` (the plaintext address) and `templateData` — encrypted by the publisher
(tower, keep, whichever service originates the request) before publishing. The rest of the
message (`contactId`, `tenant`, `application`, `category`, `type`) stays plaintext, since none
of it is independently identifying without the encrypted segment.

### Asymmetric encryption — publishers get a public key, only herald holds the private key

Rather than a single shared symmetric key, herald holds an encryption keypair. The **public**
key is distributed to every publishing service via signet (safe to share broadly — no
confidentiality requirement on a public key). The **private** key is herald's alone. This
means a compromised publisher process can encrypt garbage but can never decrypt anything
already sent — a meaningfully smaller blast radius than a shared symmetric key, where any
holder (any publisher, not just herald) would have decrypt capability. Standard signet-managed
secret distribution, same as everything else in this system — no new mechanism, just a keypair
instead of a single key.

### Templates are versioned, owned by herald

```ts
{
  actor: { namespace: 'herald', type: 'template', identifiedBy: 'templateId' },
  state: {
    communicationType: '', tenant: null,   // null = built-in/global; set = tenant-specific override
    version: 1,
    subjectTemplate: '', bodyTemplate: '',
    createdAt: '',
  }
}
```

Editing a template creates a new version rather than mutating the existing one — the same
reasoning as everything else event-sourced in this system: you need to be able to reconstruct
exactly what was sent at the time, not what the template happens to look like now.

### The minimal `communication` audit record, finalized

```ts
{
  identifiedBy: idempotencyKey,
  state: {
    tenant: '', application: '', contactId: '',    // hash -- no plaintext PII anywhere in this record
    category: '', type: '', title: '',               // title = the type's generic label (ADR prior)
    templateVersion: 0,                                 // which template version rendered this
    encryptedPayload: '',                                 // ciphertext of { to, templateData }
    channel: '', status: '', createdAt: '', sentAt: '', error: null,
  }
}
```

Herald decrypts `encryptedPayload` transiently, in memory, whenever it actually needs the
content — for the initial send *and* for a later on-demand re-render. There's no separate
"send-time plaintext copy" distinct from "stored encrypted copy" — it's the same ciphertext,
decrypted on demand, never persisted as plaintext at any point.

### On-demand rendering via an authenticated herald API — decryption never leaves herald

`web`'s admin/on-call viewer calls an authenticated herald API endpoint (permission-gated, same
`permissions` primitive established in ADR 0018/0019/0021) to view a past communication. Herald
looks up the `communication` record, fetches the matching `template` version, decrypts
`encryptedPayload` with its private key, renders, and returns the result. `web` never
independently handles the private key or performs decryption itself — the capability stays
entirely inside herald, reached only through this one authenticated path.

## Consequences

- Herald needs a keypair (private key herald-only) and the `template`/`communicationType`
  actors described here and in the prior message in this thread.
- Every publisher (tower, keep, portcullis) needs the public key distributed via signet and
  needs to encrypt the sensitive segment of any communication-send message before publishing.
- Herald needs an authenticated API surface for on-demand rendering, gated by `permissions` —
  the actual UI for this belongs to `web`'s own (not-yet-started) design.
- Retention for `encryptedPayload` specifically is still worth bounding (defense in depth —
  encrypted data retained indefinitely is still a long-term liability, e.g. future key
  compromise) — not resolved here, same open parameter as before, now scoped to just the
  encrypted segment rather than the whole record.

## Related

- [ADR 0022](0022-herald-communications-service.md), [ADR 0023](0023-pii-isolation-via-hashed-contact-records.md), [ADR 0024](0024-contact-lifecycle-sync-to-herald.md)

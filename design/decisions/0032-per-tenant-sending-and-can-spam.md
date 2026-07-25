# ADR 0032: Per-Tenant Sending Adapters and CAN-SPAM Compliance

- **Status:** Accepted
- **Date:** 2026-07-25
- **Affects:** herald, tower
- **Resolves gap 3 from the tower/herald completeness pass**

## Context

Herald was originally implicitly assumed to send through one shared, authstar-operated
provider. That's the wrong default: recipients and spam filters compare the sending domain
against the brand in the message, and most adopting tenants will want their communications to
look like they came from *them*, not from authstar — the whole point of white-labeling the
customer-facing surface. Herald needs to be a per-tenant configurable adapter layer instead,
and since it's now the thing sending marketing email, CAN-SPAM's requirements become concrete,
not theoretical.

## Decision

### Adapter architecture, no shared fallback

A common interface (`send(message) → { success, providerMessageId, error }`) with concrete
implementations per sending method. **SMTP first** — the lowest common denominator, compatible
with virtually anything a tenant already has (their own mail server, Google Workspace,
Office365, any ESP's SMTP relay) — then API-based adapters (SES, then others) layered on the
same interface as separate, richer integrations. The pattern is expected to generalize to
future channels (SMS via Twilio, push via FCM/APNs) without changing shape.

**Tenant-configured sending is required setup, not optional.** There is no shared/default
authstar-operated fallback, at any tier — this is the direct mechanism for avoiding the
domain-mismatch problem entirely, rather than mitigating it after the fact.

### Herald gets its own signet bundle, authored by tower — same pattern as portcullis

Per-tenant sending config doesn't live in a live call to tower (that would be a bad hot-path
dependency, the same category of thing this design has avoided everywhere else). Herald has its
own single signet bundle (ADR 0014's pattern), authored by tower:

```yaml
tenants:
  acme:
    sending:
      provider: smtp   # or ses, sendgrid, ...
      fromAddress: notifications@acme.example.com
      fromName: Acme
      replyTo: support@acme.example.com
      physicalAddress: "123 Main St, Springfield, ST 00000"   # CAN-SPAM requirement
      # provider-specific config (host/port for smtp, region for ses, ...)
```

with the actual credential (SMTP password, API key) as a signet secret — never persisted in
herald's own event log, same principle as ADR 0020.

### CAN-SPAM footer and `List-Unsubscribe` headers, gated strictly on `category: marketing`

Admin-set on `communicationType` (ADR 0025) — never auto-detected, never applied to
`transactional` messages, matching CAN-SPAM's actual scope.

- **Headers** (RFC 2369/8058): `List-Unsubscribe: <mailto:...>, <https://.../unsubscribe?token=...>`
  plus `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. This is what makes Gmail/Yahoo/
  Outlook show a native unsubscribe button next to the sender — increasingly a *deliverability*
  requirement, not just UX, given Google/Yahoo's 2024 bulk-sender rules requiring one-click
  support.
- **Body footer**: the tenant's `physicalAddress` plus a clearly-labeled unsubscribe link —
  satisfies CAN-SPAM's requirement for a clear, conspicuous *in-message* mechanism, and covers
  clients that don't honor the header.
- **Unsubscribe token**: stateless, signed — no separate actor or database record, since
  unsubscribing is a one-shot idempotent action, unlike invites or email verification's
  multi-step lifecycles. Encodes `{tenant, contactId, category}`, signed with a **dedicated**
  herald HMAC key, distinct from the payload-encryption keypair (ADR 0025) — the same
  key-separation discipline applied throughout this design (portcullis's session vs. internal
  keys, the identity-hash-key).
- **Two endpoints, split deliberately by HTTP method**: `GET /unsubscribe?token=...` shows a
  confirmation landing page only — **no side effect on `GET`**, both because that's correct REST
  and because automated email-security scanners routinely prefetch links found in inbound mail;
  a `GET`-triggered unsubscribe would let those scanners silently unsubscribe real recipients
  who never clicked anything. `POST /unsubscribe` performs the actual action — reached either by
  an RFC-8058-compliant client's one-click header flow, or a manual "confirm" button on the
  landing page for clients that don't support it.

## Consequences

- Herald needs the adapter interface plus an initial SMTP implementation.
- Herald needs its own signet bundle and a `sending` config section per tenant, authored by
  tower.
- Herald needs a dedicated unsubscribe-signing key (distinct from ADR 0025's payload keypair)
  and the two new public `/unsubscribe` endpoints.
- Bounce/complaint feedback mechanics still vary by adapter (flagged previously, not resolved
  here) — SMTP in particular has no standard webhook mechanism and would need inbound-email
  processing to get bounce signal at all, a materially bigger feature than anything else here.

## Related

- [ADR 0022](0022-herald-communications-service.md), [ADR 0025](0025-versioned-templates-and-encrypted-payloads.md), [ADR 0014](0014-single-bundle-prefixed-tenant-keys.md), [ADR 0020](0020-tenant-application-actors-and-secret-handling.md)

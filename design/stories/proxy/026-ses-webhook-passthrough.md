# Story 026 — SES Bounce/Complaint Webhook Passthrough

**Epic:** Utility Endpoints
**Repo:** portcullis
**Status:** Draft
**New — not present in `ref-design`.** Per [ADR 0074](../../decisions/0074-herald-bounce-complaint-and-suppression.md).

---

## Summary

Portcullis passes a tenant's own SES bounce/complaint notifications straight through to
`herald`, unauthenticated by portcullis itself — the provider's own notification signature,
verified by `herald`, is the actual authentication boundary. Structurally identical to
[Story 022](022-stripe-webhook-passthrough.md); differences noted only where they exist.

---

## Acceptance Criteria

- [ ] `POST /_authstar/webhooks/ses` is a portcullis-reserved local route — proxied straight to
      `herald`, not to the tenant's own upstream application, the same reserved category as
      `/oauth2/*`, `/_authstar/webhooks/stripe`, and every other `/_authstar/*` path.
- [ ] Application (and owning tenant) resolution runs the same as any other request (Story 013).
      Operators register this URL with the notification source (an SNS HTTPS subscription, in
      SES's case) using the tenant's `_admin` application's host specifically — same reasoning
      as Story 022, stable and always present (ADR 0044).
- [ ] **No session cookie or internal JWT is required or checked.** Portcullis resolves
      tenant/application from `Host` only, and proxies the request body/headers through to
      `herald` unchanged.
- [ ] Proxied over SPIFFE mTLS, the same service-to-service pattern as every other portcullis→
      herald call.
- [ ] `herald`'s response is relayed back unchanged.
- [ ] Not part of any tenant's configured exempt list — always present, same as every other
      `/_authstar/*` reserved path.

---

## Notes

- Signature verification happens entirely inside `herald`, against that tenant's
  `webhookSecret` (ADR 0074's extension to `sending-config`) — portcullis has no role in it,
  same division of responsibility as Story 022.
- Scoped to API-based adapters only (ADR 0074) — a tenant on the SMTP adapter has no
  `webhookSecret` configured and this route simply never receives anything meaningful for that
  tenant; no special-casing needed here, herald's own verification naturally has nothing to
  verify against.

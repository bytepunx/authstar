---
title: "Story 022: Stripe Webhook Passthrough"
updated: 2026-07-30
status: draft
---
# Story 022 — Stripe Webhook Passthrough

**Epic:** Utility Endpoints
**Repo:** portcullis
**Status:** Draft
**New — not present in `ref-design`.** Per [ADR 0046](../../adrs/0046-tenant-owned-stripe-configuration.md).

---

## Summary

Portcullis passes a tenant's own Stripe webhook events straight through to `keep`, unauthenticated
by portcullis itself — Stripe's own webhook signature, verified by `keep`, is the actual
authentication boundary.

---

## Acceptance Criteria

- [ ] `POST /_authstar/webhooks/stripe` is a portcullis-reserved local route — handled locally
      (proxied straight to `keep`, not to the tenant's own upstream application), the same
      reserved category as `/oauth2/*`, `/_authstar/analytics/events`, and `/_authstar/usage`.
- [ ] Application (and owning tenant) resolution runs the same as any other request (Story
      013). Operators register this URL with Stripe using the tenant's `_admin` application's
      host specifically (stable, always present — ADR 0044) rather than a product domain that
      might change.
- [ ] **No session cookie or internal JWT is required or checked for this route.** Stripe is
      not a browser session and carries neither. Portcullis performs no authentication of its
      own here — it resolves tenant/application from `Host` (needed to route to the correct
      backend and, implicitly, the correct tenant context) and proxies the request body/headers
      through to `keep` unchanged.
- [ ] The request is proxied over SPIFFE mTLS to `keep`, the same service-to-service pattern
      used for portcullis's other backend calls (tower, lookout).
- [ ] `keep`'s response (status and body) is relayed back to Stripe unchanged.
- [ ] This route is **not** part of any tenant's configured exempt list — it is always present,
      regardless of tenant configuration, the same as every other `/_authstar/*`/`/oauth2/*`
      reserved path.

---

## Notes

- Stripe's webhook signature verification happens entirely inside `keep`, against
  `tenant-<slug>-stripe-webhook-secret` (ADR 0046) — portcullis has no role in that
  verification and should not attempt to duplicate it.
- Unlike Story 021 (usage reporting), there is no identity/role context to attach here — this
  route carries no notion of an authenticated end user at all, only a tenant.

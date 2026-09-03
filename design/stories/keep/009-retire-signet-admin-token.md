# Story 009 — Retire Signet Admin Token

**Epic:** Config/Secrets Compliance
**Repo:** keep
**Status:** Draft — unblocked, signet-client v0.8.0 and signet server's scoped `GetSOPSPublicKey`
have shipped.
**Per:** [ADR 0103](../../decisions/0103-spiffe-scoped-signet-writes-retire-admin-tokens.md)

---

## Summary

Keep is the simplest of the three retirement stories: it only ever writes to its own bundle, so
no `CreatePolicy` grant is needed — this can land the moment the client library update ships.

## Acceptance Criteria

- [ ] Bump `@bytepunx/signet-client` to the version that adds SPIFFE-mTLS dial support for
      `gitOpsClient()`/`dialAdmin()`.
- [ ] `src/lib/signet-stripe-config-store.ts`: re-point `createSignetStripeConfigStore`'s dial at
      the SPIFFE-mTLS path (keep's own workload SVID — the same identity already used for its
      ordinary bundle fetch) instead of a bearer token.
- [ ] `src/server.ts:99,135` and `src/sync-pricing.ts:73,88`: remove `signetAdminToken` entirely
      — no `requireBundleSecret(secrets, 'signetAdminToken')` call, no token parameter passed to
      `createSignetStripeConfigStore`. Not replaced with anything; there's nothing left to source.
- [ ] `authstar-integration`: remove keep's `signetAdminToken` secret provisioning
      (`secrets/authstar/keep/`) once this lands.
- [ ] Confirm via integration/e2e test (or manual verification against a real signet instance)
      that `set(tenantSlug, config)` still succeeds with SPIFFE-mTLS auth alone — no `CreatePolicy`
      grant needed since keep only ever targets its own namespace/service.

## Not Covered Here

- Any change to what keep writes (Stripe config shape, tenant scoping) — this story is purely
  about the authentication mechanism for an unchanged write.

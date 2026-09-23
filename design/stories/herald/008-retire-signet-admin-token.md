# Story 008 — Retire Signet Admin Token

**Epic:** Config/Secrets Compliance
**Repo:** herald
**Status:** Draft — unblocked, signet-client v0.8.0 and signet server's scoped `GetSOPSPublicKey`
have shipped. Still needs the three one-time `CreatePolicy` grants provisioned (see
`authstar-integration` acceptance criterion below) before this lands.
**Per:** [ADR 0103](../../decisions/0103-spiffe-scoped-signet-writes-retire-admin-tokens.md)

---

## Summary

Herald writes to its own bundle (rotated payload/unsubscribe keys) and pushes its new payload
public key into tower's, keep's, and portcullis's bundles (ADR 0081). The own-bundle write needs
no grant; the three cross-service pushes each need a one-time `CreatePolicy` grant.

## Acceptance Criteria

- [ ] Bump `@bytepunx/signet-client` to the version with SPIFFE-mTLS dial support.
- [ ] `authstar-integration`: provision three one-time `CreatePolicy` grants — herald's SPIFFE ID
      (`ns/<namespace>/sa/herald`) → `put` permission on tower's, keep's, and portcullis's
      namespace/service — before this story's code lands, since the writes will fail without them.
- [ ] `src/lib/signet-admin.ts`: re-point `createSignetAdmin`'s dial at the SPIFFE-mTLS path
      (herald's own workload SVID) instead of a bearer token.
- [ ] `src/server.ts:144,199`: remove `signetAdminToken` entirely — no
      `requireBundleSecret(secrets, 'signetAdminToken')` call, no token parameter passed to
      `createSignetAdmin`.
- [ ] `authstar-integration`: remove herald's `signetAdminToken` secret provisioning
      (`secrets/authstar/herald/`) once this lands.
- [ ] Verify `POST /operator/rotate-keys` still succeeds end-to-end (own-bundle write + all three
      cross-service pushes) against a real signet instance with the new policy grants in place.

## Not Covered Here

- Any change to the key-rotation logic itself (ADR 0081) — this story is purely about the
  authentication mechanism for unchanged writes.

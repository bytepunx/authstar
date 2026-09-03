# Story 017 — Retire Signet Admin Token

**Epic:** Config/Secrets Compliance
**Repo:** tower
**Status:** Draft — unblocked, signet-client v0.8.0 and signet server's scoped `GetSOPSPublicKey`
have shipped. Still needs the one-time `CreatePolicy` grant provisioned (see
`authstar-integration` acceptance criterion below) before this lands.
**Per:** [ADR 0103](../../decisions/0103-spiffe-scoped-signet-writes-retire-admin-tokens.md)

---

## Summary

Tower writes to its own bundle and authors portcullis's entire bundle (tenant provisioning,
session/internal signing keys, identity-hash keys, OAuth provider client secrets, tenant key
rotation — ADR 0011/0067/0080). The own-bundle write needs no grant; the portcullis-authoring
role needs one `CreatePolicy` grant. This ADR does not reopen whether tower should keep authoring
portcullis's bundle at all (ADR 0011's call stands) — only how it authenticates while doing so.

## Acceptance Criteria

- [ ] Bump `@bytepunx/signet-client` to the version with SPIFFE-mTLS dial support.
- [ ] `authstar-integration`: provision one one-time `CreatePolicy` grant — tower's SPIFFE ID
      (`ns/<namespace>/sa/tower`) → `put` permission on portcullis's namespace/service — before
      this story's code lands.
- [ ] `src/lib/signet-admin.ts`: re-point `createSignetAdmin`'s dial at the SPIFFE-mTLS path
      (tower's own workload SVID) instead of a bearer token.
- [ ] `src/server.ts:118,166`: remove `signetAdminToken` entirely — no
      `requireBundleSecret(secrets, 'signetAdminToken')` call, no token parameter passed to
      `createSignetAdmin`.
- [ ] `authstar-integration`: remove tower's `signetAdminToken` secret provisioning
      (`secrets/authstar/tower/`) once this lands.
- [ ] Verify all current admin-token call sites still succeed end-to-end against a real signet
      instance with the new policy grant in place: `src/routes/providers.ts:217,245`,
      `src/routes/provisioning.ts:178,343,377-380`, `src/routes/admin-console.ts:91`,
      `src/routes/rotate-keys.ts:115,134,149-162`.

## Not Covered Here

- Whether tower should continue authoring portcullis's bundle at all versus portcullis someday
  gaining its own write path — that's a separate, larger question this story doesn't reopen.

---
id: ADR-0103
title: SPIFFE-Scoped Self-Service Signet Writes, Retiring Admin Tokens
status: accepted
date: 2026-09-01
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0103: SPIFFE-Scoped Self-Service Signet Writes, Retiring Admin Tokens

- **Status:** Accepted
- **Date:** 2026-09-01
- **Affects:** herald, keep, tower
- **Unblocked 2026-09-01:** signet server (`b770e01`, SPIFFE-scoped `GetSOPSPublicKey`) and
  `@bytepunx/signet-client` (`typescript-v0.8.0`, `dialWorkloadGitOps`) have shipped the
  capabilities this ADR depends on.
- **Supersedes (in part):** [ADR 0052](0052-keep-herald-own-signet-access.md) — replaces the
  admin-bearer-token mechanism it introduced with SPIFFE-scoped self-service; the underlying
  intent (herald and keep can write to their own signet bundle without tower's involvement) is
  unchanged.

## Context

Auditing herald, keep, and tower (2026-08-31/09-01, alongside [ADR 0102](0102-signet-precedence-and-fallback-scope.md)'s
work) found all three require a `signetAdminToken` — an unscoped, cluster-wide "administer"
credential — just to start up:

- **keep** (`src/lib/signet-stripe-config-store.ts`) uses it only to write to its own bundle
  (per-tenant Stripe secrets), via `pushSecret` → `GetSOPSPublicKey` + `SyncBundle`.
- **herald** (`src/lib/signet-admin.ts`, `src/routes/operator-rotate-keys.ts`) uses it to write
  its own rotated payload/unsubscribe keys into its own bundle, and to push its new payload
  public key into tower's, keep's, and portcullis's bundles (ADR 0081).
- **tower** (`src/lib/signet-admin.ts`) uses it for the broadest set: writing its own bundle, and
  authoring portcullis's entire bundle on portcullis's behalf (tenant provisioning, session/
  internal signing keys, identity-hash keys, OAuth provider client secrets, tenant key rotation —
  ADR 0011/0067/0080), since portcullis has no admin API of its own to receive a direct write.

This is a real anti-pattern: none of these services should need admin-level signet access merely
to write into a bundle they either own or have a legitimate, specific reason to write into.
Investigation (2026-09-01) found the root cause is **not** a missing signet capability — signet's
server already authorizes `SyncBundle`/`PatchServiceConfig`/`GetServiceConfig` via the caller's
verified SPIFFE identity, scoped to that identity's own namespace/service, as an alternative to
the admin bearer token (`signet/internal/api/gitops.go:138-154, 519-528`). The gap is narrower:

1. `@bytepunx/signet-client`'s `gitOpsClient()`/`dialAdmin()` only support bearer-token auth
   (`DialAdminOptions.token` is required, non-optional) — the SVID/mTLS credential-building code
   already exists in the same package (`workload.ts`) but was never wired into the GitOps/Admin
   clients, only the plain secrets client.
2. `GetSOPSPublicKey` (`signet/internal/api/gitops.go:202-205`) is hardcoded `requireToken` with
   no SPIFFE-scoped path at all — since every write needs this call to encrypt first, it forces a
   fallback to the admin token even for a caller that would otherwise qualify for the scoped path.
3. Cross-service writes (tower→portcullis, herald→tower/keep/portcullis) need one-time
   `CreatePolicy` grants (`put` permission, writer's SPIFFE ID → target's namespace/service) —
   this already exists as `AdminService.CreatePolicy`, it's an operational step, not new signet
   functionality.

These three gaps were handed to the signet team as implementation requirements, separate from
this ADR. This ADR records what authstar will do once they ship.

## Decision

Once `@bytepunx/signet-client` ships SPIFFE-mTLS dial support for GitOps/Admin operations and
`GetSOPSPublicKey` gains a scoped auth path, herald, keep, and tower each drop their
`signetAdminToken`/`SIGNET_ADMIN_TOKEN` requirement entirely and authenticate GitOps writes with
their own workload SVID instead — the same credential they already use for ordinary bundle reads.
No service will hold or request an admin-scoped credential going forward.

### keep — pure self-service, no policy grants needed

Keep only ever writes to its own bundle. Once the client update lands, it authenticates
`SyncBundle` with its own SPIFFE identity (`ns/<namespace>/sa/keep`) directly — signet's existing
exact-match authorization already covers this, no `CreatePolicy` call required. This is the
cleanest of the three and the first candidate to migrate.

### herald — self-service plus three policy grants

Herald's own-bundle write needs the same zero-grant self-service path as keep. Its cross-service
push (new payload public key → tower, keep, portcullis) needs three one-time `CreatePolicy`
grants (herald's SPIFFE ID → `put` on each target's namespace/service), provisioned once via
signet's `AdminService.CreatePolicy` (an `authstar-integration` operational change, not code).

### tower — self-service plus one broader policy grant

Tower's own-bundle write needs the zero-grant self-service path. Its portcullis-authoring role
(the broadest of the three, spanning tenant provisioning and key rotation) needs one
`CreatePolicy` grant (tower's SPIFFE ID → `put` on portcullis's namespace/service). This ADR does
not revisit whether tower should keep authoring portcullis's bundle at all versus portcullis
someday gaining its own write path — that's a separate, larger question ADR 0011 already made a
call on and this ADR doesn't reopen it.

### Removed, not replaced: the admin token itself

`SIGNET_ADMIN_TOKEN`/`secrets.signetAdminToken` and the `requireBundleSecret`/`requireEnv`
fail-loud paths [ADR 0102](0102-signet-precedence-and-fallback-scope.md) introduced for it in all
three services are deleted outright, not migrated to a new fail-loud form — there's no longer
anything to source, admin-scoped or otherwise. `createSignetAdmin`/`createSignetStripeConfigStore`
(or their equivalents) are re-pointed at the SPIFFE-mTLS dial path instead of a token-based one.

## Consequences

- **herald, keep, tower**: each gets a follow-up story (written alongside this ADR, in their
  respective `stories/` directories) specifying the exact code change once the new client version
  is available. All three stories are blocked/draft until then.
- **authstar-integration**: `SIGNET_ADMIN_TOKEN` secret provisioning for these three services is
  removed once their stories land; the one-time `CreatePolicy` grants for herald and tower become
  a new, one-time operational step (not a per-deploy secret).
- **portcullis**: unaffected — it never held a signet admin token and this ADR doesn't change
  that; tower continues authoring its bundle, now via a scoped policy grant instead of a raw
  admin token.
- No changes possible in authstar today — this ADR exists purely to record the plan and unblock
  fast follow-through once signet ships.

## Related

- [ADR 0011](0011-minimizing-towers-signet-footprint.md) — tower's cross-service admin token,
  original rationale
- [ADR 0052](0052-keep-herald-own-signet-access.md) — herald/keep's own admin tokens, mechanism
  superseded here
- [ADR 0080](0080-tenant-key-rotation-ceremony.md), [ADR 0081](0081-herald-key-rotation.md) — the
  operations these tokens actually perform, unaffected in behavior by this ADR
- [ADR 0102](0102-signet-precedence-and-fallback-scope.md) — the fail-loud admin-token handling
  this ADR removes outright rather than extends

# ADR 0012: RabbitMQ User Provisioning via a One-Shot Kubernetes Job

- **Status:** Accepted
- **Date:** 2026-07-22
- **Affects:** RabbitMQ deployment (infra), tower, keep
- **Resolves the open item in:** [ADR 0010](0010-kickr-for-rabbitmq-container.md)

## Context

ADR 0010 left open how tower's and keep's distinct, least-privilege RabbitMQ credentials get
provisioned on the broker side — the Messaging Topology Operator's `User` CRD consumes a
Kubernetes Secret reference, which is a different delivery path than a value arriving in a
service's own signet bundle. Proposed solution: a one-shot Kubernetes `Job` running a small
Node.js script, using `@bytepunx/signet-client`, that generates the credentials, deposits them
into signet, and creates the corresponding Kubernetes resources for the Topology Operator to
act on.

Checked the TypeScript signet client: it fully supports `dialAdmin` (bearer-token
`AdminService`/`GitOpsService` access, including `SyncBundle`) and `dialWorkload` (SPIFFE mTLS,
`SecretsService`). The one documented gap — `dialWorkload` fetches its SVID once at dial time
with no background rotation — is irrelevant here: a one-shot Job runs briefly and exits, well
within any SVID's TTL, so the gap that matters for a long-lived service doesn't apply.

## Decision

A one-shot Kubernetes `Job` (Node.js, `@bytepunx/signet-client`) provisions RabbitMQ users:

1. Registers as its own narrow signet workload identity (e.g. `ns/authstar/sa/rabbitmq-provisioner`)
   and fetches its own bundle via `dialWorkload`, which contains a narrowly-scoped
   `GitOpsService` admin token — provisioned once by a human operator, the same pattern
   established in ADR 0011 for tower's own admin token.
2. Generates a random credential per RabbitMQ user needed (today: `tower`, `keep`).
3. Deposits each credential into the corresponding service's own signet secret location
   (`secrets/<env>/tower/rabbitmq-credential.yaml`, etc.) via `SyncBundle`, following ADR
   0009/0011's plain-file-tree pattern (no git machinery, empty `head_sha`) — so tower and keep
   receive their credential exactly the way they receive every other secret, no special-casing
   needed on their end.
4. Creates (or updates) a Kubernetes `Secret` per user, holding the same credential value, for
   the Messaging Topology Operator's `User` CRD to reference.
5. Creates (or updates) the `User` and `Permission` CRDs (vhost-scoped, least-privilege) via
   the Kubernetes API (`@kubernetes/client-node`), so the Topology Operator provisions the
   actual RabbitMQ users.
6. Exits. Kubernetes marks the `Job` `Complete`.

The Job runs with a dedicated `ServiceAccount` and a namespace-scoped `Role` (not
`ClusterRole`) granting only what it needs: create/update on `Secret`, and on the Topology
Operator's `User`/`Permission` CRDs, within the namespace RabbitMQ runs in.

Wired as a Helm `post-install` hook on the authstar chart, so it runs automatically once
RabbitMQ and the Topology Operator are up, without a manual step.

## Open Items — Not Resolved Here

- **Idempotency vs. rotation.** As a `post-install` hook, the Job should check whether each
  target secret/User already exists and skip generation if so — a `post-upgrade` re-run should
  not silently rotate credentials on every deploy. Deliberate credential rotation is a distinct
  operation this ADR does not design: rotating requires coordinating signet's
  watch-triggered restart of tower/keep with the Topology Operator applying the new password to
  the actual RabbitMQ user, and a naive re-run risks a window where the two are out of sync
  (tower holds the new credential before RabbitMQ accepts it, or vice versa). **Tracked for a
  future ADR when rotation is actually needed.**

## Consequences

- No manual step is needed to get tower/keep talking to RabbitMQ with their own least-privilege
  credentials after a fresh install.
- Introduces one more small, purpose-built component (the provisioner Job/image) to build and
  maintain, with its own narrow signet identity and Kubernetes RBAC grant.
- Rotation remains explicitly unsolved and should not be assumed to work by simply re-running
  this Job.

## Related

- [ADR 0010](0010-kickr-for-rabbitmq-container.md)
- [ADR 0011](0011-minimizing-towers-signet-footprint.md) — the admin-token-as-bundle-secret pattern this Job reuses
- `~/git/signet-clients/typescript/README.md`

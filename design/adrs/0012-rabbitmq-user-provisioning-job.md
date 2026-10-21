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

## Rotation-Safe Design

The script is written from the start to support two modes, so the same image serves both
bootstrap and scheduled rotation rather than needing a second implementation later:

- **`MODE=bootstrap`** (used by the `post-install` hook): generate and provision a credential
  only if one doesn't already exist for that user. A `post-upgrade` or otherwise-repeated run
  in this mode is a no-op against an already-provisioned user.
- **`MODE=rotate`** (used by the scheduled CronJob below): always generates a fresh credential
  and runs the cutover in a specific order that bounds the risk window instead of leaving it
  undesigned:
  1. Generate the new credential.
  2. Update the RabbitMQ side **first** — the `Secret` and the `User` CRD — and wait for the
     Topology Operator to report the change applied before continuing.
  3. Only then deposit the new credential into tower's/keep's own signet bundle via
     `SyncBundle`, which triggers their normal watch-and-coordinated-restart cycle.

  RabbitMQ does not drop already-established connections on a password change — only new
  connection attempts require the new credential — so this ordering means the only remaining
  exposure is a service needing to *reconnect* (e.g. after a network blip) during the short
  window between step 2 and the service actually restarting with the new credential. That's a
  materially smaller, bounded risk than rotating with no ordering at all, though it is not
  zero; a further hardening step (e.g. RabbitMQ accepting two live credentials per user during
  a grace period) is possible but not implemented here.

## Scheduled Rotation

A Kubernetes `CronJob` runs the same image in `MODE=rotate` on a recurring basis.

The `CronJob` fires **daily** at 3 AM and rotates unconditionally on every firing — a 24-hour
cadence, chosen deliberately short so the rotation path (the ordered RabbitMQ-then-signet
cutover from the previous section) gets exercised constantly during the period where it's
being validated for outage-free behavior, rather than waiting weeks between real-world
exercises of it. No elapsed-time gate is needed against the credential's `Secret`, since the
fire interval already equals the intended rotation interval; `MODE=rotate` runs every time the
`CronJob` fires. This cadence is expected to change once the ordering has been proven safe
under testing — likely to something considerably longer for steady-state production use — at
which point reintroducing an elapsed-time check (rather than assuming the schedule alone
defines the interval) is worth reconsidering, particularly if the schedule ever needs to tolerate
a missed/delayed firing without silently skipping a rotation or double-rotating.

"3 AM in the server's time zone" is expressed via the `CronJob`'s `spec.timeZone` field (stable
since Kubernetes 1.27), set to an IANA time zone name supplied as a Helm value for the
deployment — not a hardcoded UTC offset, which would drift incorrectly across DST changes and
would be wrong for any deployment not in the chart author's own time zone.

```yaml
spec:
  schedule: "0 3 * * *"
  timeZone: "America/New_York"   # Helm value, per-deployment
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: rabbitmq-provisioner
              env:
                - name: MODE
                  value: rotate
```

## Consequences

- No manual step is needed to get tower/keep talking to RabbitMQ with their own least-privilege
  credentials after a fresh install.
- Introduces one more small, purpose-built component (the provisioner Job/image) to build and
  maintain, with its own narrow signet identity and Kubernetes RBAC grant — now also including
  a `CronJob` and permission to read/write a rotation timestamp annotation on each credential
  `Secret`.
- Rotation now has a defined, ordered cutover rather than being unsolved, but still carries a
  small residual reconnect-race window (see above) that a future hardening pass could close
  further.

## Related

- [ADR 0010](0010-kickr-for-rabbitmq-container.md)
- [ADR 0011](0011-minimizing-towers-signet-footprint.md) — the admin-token-as-bundle-secret pattern this Job reuses
- `~/git/signet-clients/typescript/README.md`

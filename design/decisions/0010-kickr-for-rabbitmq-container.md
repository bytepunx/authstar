# ADR 0010: kickr as RabbitMQ's Container Entrypoint

- **Status:** Accepted
- **Date:** 2026-07-21
- **Affects:** RabbitMQ deployment (infra, not a service repo)
- **Refines:** [ADR 0008](0008-rabbitmq-identity-without-native-spiffe.md)

## Context

ADR 0008 established that RabbitMQ's identity/authorization uses conventional credentials
distributed as signet-managed secrets, since RabbitMQ can't natively consume SPIFFE identity.
That left open how RabbitMQ's own container actually receives those secrets from signet. kickr
(`~/git/kickr`) exists specifically to wrap a signet-unaware third-party binary — fetch its
bundle, inject it, and coordinate a rolling restart on change — which is exactly RabbitMQ's
situation.

Checking kickr's own design doc: its injection model is **environment variables only**, by
deliberate design ("Config: Environment variables only — kickr is a container wrapper"; no
file-writing path exists, config keys and secrets are both upcased and set as env vars on the
child process). This is a clean fit for anything RabbitMQ's official image already reads from
the environment — notably `RABBITMQ_DEFAULT_USER`/`RABBITMQ_DEFAULT_PASS`, its bootstrap
credential. It is **not** a fit for:

- RabbitMQ's TLS listener certificate, which needs file paths
  (`ssl_options.certfile`/`keyfile`/`cafile`) — already assigned to cert-manager under ADR
  0008, so this isn't a new gap, just a boundary worth stating explicitly.
- Provisioning tower's and keep's own **distinct**, least-privilege RabbitMQ users. That's the
  Messaging Topology Operator's job (per ADR 0006), whose `User` CRD consumes a Kubernetes
  Secret reference — a different delivery path than an env var injected into RabbitMQ's own
  process.

## Decision

Use kickr as RabbitMQ's container entrypoint (`KICKR_COMMAND=rabbitmq-server` or equivalent).
It handles:

- Fetching RabbitMQ's own bootstrap credential and any other env-var-configurable RabbitMQ
  settings from its signet bundle.
- Coordinating a fleet-wide serialized restart when that bundle changes (the same
  `AcquireRestartLock` protocol every other signet-backed service uses).

This does not require building anything new — it's kickr's designed use case, applied to
RabbitMQ instead of an authstar-authored service.

## Open Item — Not Resolved Here

How tower's and keep's own distinct RabbitMQ credentials (generated once, delivered to each
service via its own signet bundle per ADR 0008) also get provisioned on the RabbitMQ/Topology-
Operator side. The Messaging Topology Operator's `User` CRD expects a Kubernetes Secret
reference, not a value kickr can hand it — something needs to materialize the same credential
value (or its hash) that tower/keep each receive into a k8s Secret the operator can read.
Candidates not yet evaluated: a small one-shot init job that reads the value from signet and
writes a k8s Secret; generating the credential as part of tenant/environment provisioning
(ADR 0009's `SyncBundle` flow) and emitting both the service-facing secret and the
operator-facing Secret from the same source of truth. **Tracked, not designed further here.**

**Resolved by [ADR 0012](0012-rabbitmq-user-provisioning-job.md)**: a one-shot Kubernetes `Job`
(the first candidate above), reusing ADR 0011's admin-token-as-bundle-secret pattern.

## Consequences

- RabbitMQ's Docker image needs kickr as its `PID 1`/entrypoint, wrapping `rabbitmq-server` as
  the child process.
- TLS certificate delivery for RabbitMQ's listener stays entirely on cert-manager, untouched by
  this decision.
- Per-service RabbitMQ user provisioning (tower, keep) remains open — flagged above.

## Related

- [ADR 0008](0008-rabbitmq-identity-without-native-spiffe.md)
- [ADR 0006](0006-rabbitmq-as-message-broker.md) — Messaging Topology Operator
- `~/git/kickr/design/draft.md`

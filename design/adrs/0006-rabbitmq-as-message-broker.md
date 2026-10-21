---
id: ADR-0006
title: RabbitMQ as the Inter-Service Message Broker
status: accepted
date: 2026-07-21
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0006: RabbitMQ as the Inter-Service Message Broker

- **Status:** Accepted
- **Date:** 2026-07-21
- **Affects:** tower, keep
- **Resolves an open item in:** [ADR 0001](0001-claims-enrichment-via-tower.md)

## Context

ADR 0001 established that keep publishes async messages that tower consumes to update its
materialized user records, but left the transport mechanism unresolved. kluster's `authstar`
profile already provisions RabbitMQ, which prompted evaluating it against NATS JetStream
before treating it as settled rather than assuming it by default.

Both were evaluated against the actual requirement: at-least-once, durable delivery of domain
events (e.g. a non-payment threshold crossed) from keep to tower, with per-entity ordering and
idempotent consumption on tower's (already event-sourced, via consequent) side. The durable
historical log is already consequent's event store on the publishing side — the broker's job
here is reliable transport/notification, not being the permanent system of record.

## Decision

RabbitMQ, using **quorum queues** (not classic mirrored queues), is the message broker for
inter-service async messaging in authstar, starting with keep → tower.

### Why RabbitMQ over NATS JetStream

Both are legitimate, actively maintained choices; the deciding factors:

- **Failure mode asymmetry.** RabbitMQ quorum queues (Raft-based, majority-write-confirms-before-ack)
  tolerate a minority node loss with no availability impact; if a majority is permanently lost,
  the queue becomes unavailable and must be force-deleted and recreated — a loud, explicit
  failure. NATS JetStream has a documented edge case where a node that lost local data
  (OS/disk failure) can rejoin and contribute to a new majority alongside nodes that never
  received a given message, meaning a previously-acknowledged message can be silently lost
  under compound failure. Given how much of ADR 0001 is built around never silently serving a
  stale/wrong claims decision, the louder failure mode is the better fit here.
- **Operator/GitOps fit.** RabbitMQ's Messaging Topology Operator manages the entire AMQP
  topology (queues, exchanges, bindings, policies, vhosts) as Kubernetes CRDs — declared in
  git, applied automatically. This is directly consistent with the GitOps posture already
  established for signet (ADR 0004) and available as a further addon via kluster's existing
  ArgoCD support.
- **Governance risk, explicitly accepted.** RabbitMQ is now owned by Broadcom
  (post-VMware acquisition), which is a real but accepted risk: the currently-licensed
  open-source version can continue to be run/pinned regardless of how future releases are
  licensed, so this isn't treated as a blocker.

NATS's CNCF-neutral governance and lighter operational footprint were real points in its
favor, but not enough to outweigh the failure-mode difference for this specific,
correctness-sensitive use case.

## Consequences

- **Story/design follow-up for keep**: events must be published via an **outbox pattern**
  (written in the same DB transaction as the domain state change, relayed separately) rather
  than a direct dual-write to Postgres + RabbitMQ, to avoid the exact class of inconsistency
  ADR 0001 is designed to prevent.
- **Story/design follow-up for tower**: the RabbitMQ consumer must be idempotent — safe to
  reprocess a redelivered message without corrupting materialized state. This follows
  naturally from tower's event-sourced (consequent) model but should be explicit, not assumed.
- AMQP topology (queues, exchanges, bindings, dead-letter configuration) should be declared via
  the Messaging Topology Operator's CRDs and committed to git, not created imperatively.
- kluster's `authstar` profile currently runs RabbitMQ single-node (dev-only). Production needs
  real quorum queue clustering (3 or 5 nodes per RabbitMQ's own sizing guidance) — not designed
  here.
- SPIFFE/mTLS-authenticated access to RabbitMQ (matching the identity model signet uses) is not
  yet designed — RabbitMQ has no native SPIFFE integration the way signet does, so this would
  need to be built as conventional mTLS using SPIRE-issued SVIDs as client certs, or accept a
  different auth mechanism for broker access. **Tracked, not resolved.**

## Related

- [ADR 0001](0001-claims-enrichment-via-tower.md) — the messaging mechanism this ADR resolves
- [ADR 0004](0004-signet-for-configuration-and-secrets.md), [ADR 0005](0005-kluster-for-local-development-and-testing.md)

# ADR 0008: RabbitMQ Access Without Native SPIFFE Support

- **Status:** Accepted
- **Date:** 2026-07-21
- **Affects:** tower, keep
- **Resolves an open item in:** [ADR 0006](0006-rabbitmq-as-message-broker.md)

## Context

ADR 0006 flagged that RabbitMQ has no native SPIFFE integration, unlike signet. Confirmed by
checking RabbitMQ's own `rabbitmq_auth_mechanism_ssl` plugin documentation: it can extract a
client's identity from a certificate's **DNS** or **email** Subject Alternative Name, but does
not document support for the **URI** SAN — which is specifically where a SPIFFE ID lives
(`spiffe://<trust-domain>/...`). There is no documented native path for RabbitMQ to understand
a SPIRE-issued X.509-SVID's identity.

A SPIFFE-aware sidecar (e.g. Envoy fetching certs via SDS from the SPIRE Workload API,
terminating mTLS and enforcing SPIFFE-ID-based authorization before forwarding to RabbitMQ) is
possible but is real infrastructure to build and operate, for what is currently a small, known
set of internal callers — tower and keep.

## Decision

Do not attempt to make RabbitMQ SPIFFE-aware. Split transport security from identity:

- **Transport encryption**: RabbitMQ's listener uses conventional TLS (cert-manager-issued,
  matching the pattern already used for Traefik in kluster's `spire` profile). SPIRE-issued
  certs are not required here since RabbitMQ can't consume their identity anyway.
- **Identity and authorization**: conventional RabbitMQ credentials (one per service — tower,
  keep — with vhost/queue/exchange permissions scoped accordingly), **distributed and rotated
  as signet-managed secrets**, per ADR 0004. Each service's RabbitMQ credential arrives in its
  own signet bundle and rotates through the same watch/coordinated-restart cycle as every other
  secret it holds. This keeps a single, consistent secret-distribution story even though
  RabbitMQ itself doesn't participate in the SPIFFE trust domain.

A SPIFFE-aware sidecar in front of RabbitMQ is a legitimate future hardening step if the set of
callers grows large or less trusted, but isn't justified for two known, internal services.
**Tracked, not designed further here.**

## Consequences

- No new infrastructure (sidecar, SDS, custom auth plugin) is required to ship keep → tower
  messaging.
- Tower and keep each need a distinct RabbitMQ credential provisioned and delivered via their
  own signet bundle — an addition to what each service's bundle contains, not a new mechanism.
- If/when broker access needs to extend to a less-trusted or larger set of callers, revisit a
  SPIFFE-terminating sidecar rather than trying to extend RabbitMQ's own SAN-parsing to URI
  SANs (unsupported) or maintaining a custom auth plugin.

## Related

- [ADR 0006](0006-rabbitmq-as-message-broker.md)
- [ADR 0004](0004-signet-for-configuration-and-secrets.md)
- `rabbitmq/rabbitmq-server` — `deps/rabbitmq_auth_mechanism_ssl/README.md`

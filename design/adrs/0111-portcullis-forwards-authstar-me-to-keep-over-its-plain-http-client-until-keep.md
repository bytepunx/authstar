---
id: ADR-0111
title: "Portcullis forwards /_authstar/me/* to keep over its plain HTTP client until keep has an east-west mTLS listener"
status: accepted
date: 2026-11-09
supersedes: []
superseded_by: []
refines: [ADR-0071]
---

# ADR-0111 Portcullis forwards /_authstar/me/* to keep over its plain HTTP client until keep has an east-west mTLS listener

## Context

ADR 0071 has portcullis route the `/_authstar/me/*` family to its owning backend over SPIFFE mTLS. When S-0006 added `/_authstar/me/subscription`, portcullis's SPIFFE mTLS client could reach tower only (`portcullis/TESTING.md` lists keep, herald, lookout, and web as still to come), and keep serves plain HTTP inside the cluster. ADR 0095 already sends Stripe webhooks from portcullis to keep over portcullis's plain HTTP client for the same reason.

The operator accepted this recommendation on TH-0002 (2026-11-06).

## Decision

Portcullis forwards `/_authstar/me/subscription`, and any later `/_authstar/me/*` route keep owns, to keep over its plain HTTP client, the one ADR 0095 uses for webhooks. Each forward carries the gate's internal JWT as a bearer token, and keep checks that token as it would on any other route. When the east-west mTLS work gives keep an mTLS listener and portcullis a client for it, these forwards move to SPIFFE mTLS, as ADR 0071 says. Routes tower owns keep using SPIFFE mTLS.

## Consequences

- Inside the cluster, traffic from portcullis to keep on `/me/*` is not encrypted or authenticated at the transport layer. The internal JWT is still checked against portcullis's JWKS, so a caller without a token portcullis minted gets a 403.
- The story that brings mTLS to keep must also move both portcullis's webhook forward (ADR 0095) and its `/me/*` forward.
- S-0006 is not blocked waiting for keep's mTLS listener.

## Alternatives considered

- **Block S-0006 until keep has an mTLS listener.** The widget would get no server until the east-west story is done. Rejected by the operator on TH-0002.
- **Add an mTLS listener to keep within S-0006.** That is a much larger change than this story's scope, and the east-west story is where it belongs.

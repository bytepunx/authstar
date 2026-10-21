---
title: Story 011a — WebSocket Upgrade and Passthrough
updated: 2026-07-22
status: draft
---
# Story 011a — WebSocket Upgrade and Passthrough

**Epic:** Reverse Proxy
**Repo:** portcullis
**Status:** Draft
**New — not present in `ref-design`**, which explicitly scoped WebSocket support out of its
Story 011. Portcullis is authstar's ingress edge for adopting applications, and real-time
features are common enough that this needs to be in scope, not deferred indefinitely.

---

## Summary

Portcullis proxies WebSocket connections end-to-end: it authenticates the upgrade handshake
exactly like any other request, then switches to transparent bidirectional byte-stream
forwarding between client and upstream for the life of the connection.

---

## Acceptance Criteria

### Handshake

- [ ] A request carrying `Connection: Upgrade` and `Upgrade: websocket` is routed through the
      normal auth gate (Story 013) — tenant resolution, session JWT verification, exempt-route
      check, and the enrichment `Allow`/`Deny`/`Unreachable` outcome (ADR 0001/0003) all apply
      to the handshake request exactly as they would to any other HTTP request.
- [ ] On a successful, authenticated handshake, portcullis signs one internal token (Story 010)
      and attaches it as `Authorization: Bearer` on the upgrade request forwarded to the
      upstream — the same one-shot pattern as a normal proxied request, not something
      refreshed for the life of the connection.
- [ ] Prefix-based upstream routing (Story 012) applies to the handshake request's path the
      same way it does for any other request.
- [ ] `X-Forwarded-For`/`X-Forwarded-Proto`/`X-Forwarded-Host` are set on the forwarded
      handshake request, matching Story 011's behavior for regular requests.
- [ ] The `Origin` header on the handshake request is checked against the tenant's configured
      CORS origin(s) (Story 019) — browsers still send `Origin` on a WebSocket handshake even
      though the WebSocket protocol itself doesn't use `Access-Control-*` response headers the
      way a normal cross-origin HTTP response does.
- [ ] If the upstream's response to the handshake is not a successful protocol switch (`101
      Switching Protocols`), portcullis forwards the upstream's actual response and status code
      to the client unchanged — it does not synthesize its own error.

### Passthrough

- [ ] Once the upstream returns `101 Switching Protocols`, portcullis stops applying HTTP
      request/response semantics to the connection and forwards raw bytes bidirectionally
      between client and upstream until either side closes.
- [ ] No further authentication or authorization check is performed for the life of the
      connection — auth applies once, at handshake time, the same as the internal token's
      one-shot design intent (Story 010).
- [ ] Portcullis enforces a configurable **idle timeout**: if no bytes are forwarded in either
      direction for the configured duration, portcullis closes the connection. This is a
      resource-protection measure at the proxy layer, independent of whatever timeout behavior
      (if any) the upstream itself implements.
- [ ] Either side closing its end of the connection propagates: portcullis closes the
      corresponding end of the other connection rather than leaving a half-open pair.

---

## Explicit Limitation — Session Expiry Mid-Connection

A WebSocket connection is not torn down if the session JWT that authenticated its handshake
expires while the connection is still open — there is no per-message or periodic re-check.
This is a deliberate consequence of authenticating once at handshake time (the same trade-off
Story 016 already accepts for logout not retroactively invalidating an issued session JWT), not
an oversight. An application with a hard requirement to disconnect a session immediately on
expiry or revocation would need its own active-connection tracking; that's out of scope here.

---

## Notes

- Idle timeout default and configurability live in the tenant's config section (Story 001) —
  exact key name and default value not decided in this story.
- Sticky routing / connection affinity across portcullis replicas is not addressed here; each
  WebSocket connection is a single long-lived TCP connection to one portcullis instance for its
  duration, which needs no special handling as long as the upstream connection is also
  established from that same instance (it is, since the handshake and the passthrough happen
  in the same request lifecycle).

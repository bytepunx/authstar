---
title: "Story 020: Analytics Event Ingestion"
updated: 2026-08-01
status: draft
---
# Story 020 — Analytics Event Ingestion

**Epic:** Utility Endpoints
**Repo:** portcullis
**Status:** Draft
**New — not present in `ref-design`.** Per [ADR 0035](../../adrs/0035-lookout-and-chronicle-analytics.md),
[ADR 0058](../../adrs/0058-analytics-event-shape-corrections.md).

---

## Summary

Portcullis publishes fire-and-forget analytics telemetry to `lookout` for every proxied
request, and locally handles a new client-side event-ingestion route so front-end code can
report analytics through a first-party endpoint instead of a third-party script.

---

## Acceptance Criteria

### Server-side dispatch

- [ ] After proxying each request (Story 011), portcullis asynchronously dispatches an
      `analytics.request` event to `lookout` over SPIFFE mTLS — not awaited as part of the
      response cycle. This includes `tenant`, `application`, `method`, `path`, `status`,
      `latency`, and `identityHash` if a valid session was present (Story 009) — never
      `accountId` (would require a live tower call this path deliberately avoids) and never an
      IP address.
- [ ] Dispatch failure (timeout, connection refused, `lookout` unreachable) has **zero** effect
      on the proxied request — no retry, no error-level log, at most a debug-level note or a
      metric counter. This must never be a source of added latency or failure.
- [ ] Auth-funnel events (`analytics.auth.login-succeeded`, `login-failed`, `logout`,
      `invite-redeemed`, `signup-completed`) are dispatched the same fire-and-forget way at the
      point each occurs (Stories 006, 008, 010, 016), not synthesized later from generic request
      events.
- [ ] **`analytics.auth.login-succeeded` and `login-failed` carry `idp`** (already a claim on
      the verified session JWT, Story 009 — no new plumbing, just an explicit field
      requirement, ADR 0058). **`login-failed` additionally carries a coarse `reason` category**
      (`state_mismatch | pkce_missing | token_exchange_failed | userinfo_failed |
      incomplete_profile`, mapped from Story 006's error table) — never the raw provider error,
      which stays server-side-only per Story 006's existing discipline.
- [ ] `analytics.auth.signup-completed` is dispatched from Story 010, when enrichment's `Allow`
      outcome carries `isNewAccount: true` (ADR 0058) — not derived or inferred anywhere else.
- [ ] Sampling rate is configurable per application (default: full fidelity) — exact config key
      not decided here, flagged as a tunable per ADR 0035.

### Client-side ingestion route

- [ ] `POST /_authstar/analytics/events` is a portcullis-reserved local route — handled
      locally, never proxied upstream, not part of any tenant's configured exempt list (the
      same category as `/oauth2/*`, always present regardless of tenant config).
- [ ] Session verification (Story 009) still runs: a valid session attaches `identityHash` to
      the forwarded event; no valid session forwards the event without it — the request is
      **never rejected** for lacking a session, following the same reasoning as exempt-route
      handling (ADR 0015) — pre-auth activity (landing pages, signup funnel) is legitimate
      signal, not something to gate on authentication.
- [ ] The request body is forwarded to `lookout` as an `analytics.client.<eventType>` event,
      with `tenant`/`application`/`identityHash` attached by portcullis — never trusted from the
      client body itself, even if the client includes conflicting values.
- [ ] Portcullis does not itself validate the event schema or enforce the type allowlist —
      that's `lookout`'s responsibility (ADR 0035) — portcullis's job here is identity
      attachment and routing, not payload validation.
- [ ] Same fire-and-forget dispatch semantics as the server-side path: this call is never
      awaited as part of the response to the client, and its failure never surfaces to the
      caller as an error.

---

## Notes

- This route exists specifically so an adopting application's front-end can report analytics to
  a first-party endpoint (this one) instead of a third-party script — see ADR 0035 for the
  full motivation.
- No IP address is ever captured, read, or forwarded by either path in this story — this is
  unconditional, not a configuration option.
- Cross-reference: Story 011 (reverse proxy forwarding) is the request-lifecycle context this
  story's server-side dispatch attaches to, the same relationship Story 011a (WebSocket) has to
  Story 011.

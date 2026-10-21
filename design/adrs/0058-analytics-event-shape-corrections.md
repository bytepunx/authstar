# ADR 0058: Analytics Event Shape Corrections for the Auth Funnel Report

- **Status:** Accepted
- **Date:** 2026-08-01
- **Affects:** tower, portcullis
- **Resolves gaps found while designing:** [ADR 0059](0059-web-analytics-screens.md)

## Context

Chronicle's auth-funnel report (ADR 0036) is described as covering "login attempts/success/
failure by provider" and "signup conversion" — neither is actually computable with the event
shapes as specified. `analytics.auth.login-succeeded`/`login-failed` (ADR 0035/Story 020) were
never given an explicit field list, and nothing distinguishes first-time account creation from
a returning login at all.

## Decision

### `analytics.auth.login-succeeded`/`login-failed` gain explicit fields

- `idp` — already a claim on the verified session JWT (Story 009); no new plumbing, just an
  omission in the event's documented field list, now corrected.
- `login-failed` gains a coarse `reason` category, never the raw provider error Story 006
  already keeps server-side-only: `state_mismatch | pkce_missing | token_exchange_failed |
  userinfo_failed | incomplete_profile`, mapped directly from Story 006's existing error table.

### Login-time identity resolution gains `isNewAccount`; portcullis dispatches a new event

> **Corrected 2026-08-03:** originally described as part of the ordinary enrichment `Allow`
> outcome (Story 010) — since split into two separate tower endpoints
> ([tower Story 002](../stories/tower/002-claims-enrichment-endpoint.md) for ordinary
> per-request enrichment, which never creates accounts and therefore never has this field;
> [tower Story 003](../stories/tower/003-identity-resolution-at-login.md) for login-time
> resolve-or-create, called once via [Story 006](../stories/proxy/006-oauth2-callback.md), which
> is where this actually lives). The decision below is otherwise unchanged.

Tower's login-time identity-resolution response gains `isNewAccount: boolean` — true exactly
once, the first time resolution creates a new account rather than matching an existing identity.
On `true`, portcullis dispatches a new `analytics.auth.signup-completed` event (same
fire-and-forget discipline as every other analytics dispatch, Story 020) — this is what makes
"signup conversion" (`signup-completed` ÷ `login-succeeded`) a real, computable metric rather
than an aspirational report description.

**`isNewAccount` is consumed by portcullis for this dispatch only — it never appears on any
token.** Unlike `usage` (ADR 0043), which the upstream application genuinely needs, this is
purely an authstar-internal analytics signal with no reason to reach the application.

## Consequences

- Tower's login-time identity-resolution response and Story 006's handling both need this field
  added (not Story 010 — see the correction above).
- Portcullis gains one more conditional analytics dispatch, alongside its existing ones.
- The auth-funnel report (ADR 0036/0059) can now compute what it was always described as
  computing.

## Related

- [ADR 0001](0001-claims-enrichment-via-tower.md), [ADR 0006](0006-rabbitmq-as-message-broker.md), [ADR 0017](0017-account-identity-and-role-model.md), [ADR 0018](0018-trial-roles-and-keep-boundary.md), [ADR 0035](0035-lookout-and-chronicle-analytics.md), [ADR 0036](0036-chronicle-reporting-api-and-retention-config.md), [ADR 0043](0043-application-reported-usage-metering.md), [ADR 0059](0059-web-analytics-screens.md)

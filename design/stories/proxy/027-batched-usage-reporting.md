# Story 027 — Batched Usage Reporting (Credential-Authenticated)

**Epic:** Utility Endpoints
**Repo:** portcullis
**Status:** Draft
**New — not present in `ref-design`.** Per [ADR 0079](../../decisions/0079-batched-usage-reporting-credentials.md).

---

## Summary

A companion route to [Story 021](021-usage-metering-reporting.md) for usage reports that don't
happen inside a live, portcullis-fronted request — a background job or batched process has no
internal JWT to present, so this route accepts a durable, keep-issued credential instead and
skips the normal session/JWT gate entirely.

---

## Acceptance Criteria

- [ ] `POST /_authstar/usage-reports` is a portcullis-reserved local route, distinct from
      Story 021's `/_authstar/usage` — never proxied to a tenant's own upstream.
- [ ] **Exempt from the normal auth gate** (Story 013/Story 003) — the caller has no session and
      no internal JWT, only the credential below. This is the same posture as the Stripe/SES
      webhook routes (Stories 022/026): no session check, but not truly anonymous either, since
      `keep` performs its own authentication downstream.
- [ ] Tenant/application resolution from `Host` still runs first, same as any other request
      (Story 013's first step, unaffected by the auth-gate exemption above).
- [ ] The `Authorization: Bearer <credential>` header and request body (`meter`, `quantity`,
      `idempotencyKey`) are passed through to `keep` unmodified — portcullis performs no
      verification of the credential itself; that's entirely `keep`'s responsibility (ADR 0079).
- [ ] Proxied to `keep` over SPIFFE mTLS, the same connection as every other portcullis→keep
      call (Story 021, Story 026) — no new addressing mechanism.
- [ ] `keep`'s response (recorded, duplicate, rejected, or `401` for a bad/revoked credential)
      is relayed back unchanged. If `keep` is unreachable, `502`/`504`, same as any other
      unreachable-upstream case.

---

## Notes

- Deliberately a **second** route rather than accepting both auth types on
  `/_authstar/usage` — that route's whole contract (Story 021) is "authenticated by the internal
  JWT, no exceptions," and overloading it with a second, exempt auth path would blur a
  distinction worth keeping sharp: one route always requires an active session-derived identity,
  the other never does.
- Both routes converge on the same keep-side recording logic (ADR 0043/0079) — this story's only
  job is getting the request to `keep` with the right credential attached; everything after that
  is identical to Story 021's downstream behavior.

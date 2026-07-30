# Story 021 — Usage Metering Reporting

**Epic:** Utility Endpoints
**Repo:** portcullis
**Status:** Draft
**New — not present in `ref-design`.** Per [ADR 0043](../../decisions/0043-application-reported-usage-metering.md).

---

## Summary

Portcullis accepts application-initiated usage reports at a reserved local route, authenticates
them against the internal JWT the application already holds, and proxies them through to
`keep` for durable recording — distinct from Story 020's fire-and-forget analytics dispatch in
every way that matters: this call is the request, not a passenger on one, and it must not be
silently dropped on failure.

---

## Acceptance Criteria

- [ ] `POST /_authstar/usage` is a portcullis-reserved local route — handled locally, never
      proxied to a tenant's own upstream, not part of any tenant's configured exempt list (the
      same reserved category as `/oauth2/*` and `/_authstar/analytics/events`, Story 020).
- [ ] Application (and owning tenant) resolution runs the same as any other request (Story 013)
      — the incoming `Host` is the tenant's real public host, since the calling application
      constructed this URL from its own inbound request's `X-Forwarded-Host` (Story 011).
- [ ] **Authentication for this route is the internal JWT, not the session cookie.** The
      `Authorization: Bearer <token>` header is verified using Story 009's verification logic,
      pointed at the resolved tenant's **internal** signing keypair (Story 010) instead of the
      session keypair — signature, `iss`, `aud`, `exp` all checked the same way, `kid` selecting
      the key. No tower call is made to verify this — portcullis signed the token itself.
- [ ] A missing, malformed, expired, or signature-invalid `Authorization` header is rejected
      with `401`, following the same generic-body, detail-logged-not-exposed contract as Story
      015 — this route is not exempt from authentication the way Story 020's client-analytics
      route is, since there is no legitimate anonymous use of it.
- [ ] The request body (`meter`, `quantity`, `idempotencyKey`) is validated for presence of
      `meter` and `idempotencyKey` at minimum; `quantity` defaults to `1` if absent. Portcullis
      does not validate `meter` against any catalog — that's `keep`'s responsibility.
- [ ] Portcullis attaches `tenant`, `application`, `accountId`, and `roles` (all already
      resolved from the verified internal JWT's claims) to the request forwarded to `keep`,
      overriding anything the request body might otherwise claim for these fields.
- [ ] **This call is proxied to `keep` over SPIFFE mTLS as a real request/response — not
      fire-and-forget.** Portcullis awaits `keep`'s response and relays it back to the calling
      application largely unchanged (status code and body), including a rejection (e.g.
      unrecognized meter) or a duplicate-record acknowledgment. If `keep` is unreachable or
      times out, portcullis returns `502`/`504` to the application, the same as any other
      unreachable-upstream case (Story 011) — it does not silently succeed.

---

## Notes

- This route's authentication model (bearer internal JWT, no cookie) is unique among portcullis's
  local routes — every other reserved route either requires a session cookie (none currently
  do) or works with or without one (Story 020). Worth flagging explicitly during implementation
  so it isn't accidentally built against the wrong verification path.
- Because the internal JWT is only valid for 60 seconds from signing (Story 010), this route
  only supports usage reporting that happens synchronously, within the application's own
  handling of the original request that carried the token. Deferred, batched, or background-job
  usage reporting is not supported by this mechanism (ADR 0043) — an application with that need
  is not served by this story.
- Cross-reference: Story 020 is the fire-and-forget analytics-dispatch counterpart to this
  story; the two are deliberately different in almost every respect (durability, blocking
  behavior, authentication) despite superficially similar "app reports something to portcullis"
  framing — see ADR 0043's rationale for why they aren't unified into one mechanism.

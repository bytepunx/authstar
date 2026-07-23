# Story 015 — Gate Rejection Responses

**Epic:** Reverse Proxy
**Repo:** portcullis
**Status:** Draft
**Adapted from:** `ref-design` Story 015 ("Unauthenticated API Client Response") — broadened
per [ADR 0003](../../decisions/0003-enrichment-outcome-response-contract.md) to cover every way
the gate (Story 013) can reject a request, not just the missing-session-JWT case.

---

## Summary

The gate can reject a request for three distinct reasons — no valid session on a protected
route, tower's explicit `Deny`, or an `Unreachable` enrichment call under a fail-closed policy.
All three share one response contract: a generic client-facing body, full detail logged
server-side, nothing that leaks *why* to the caller.

---

## Acceptance Criteria

### No valid session, API client (unchanged from `ref-design` Story 015)

- [ ] `401 Unauthorized`, `Content-Type: application/json`, body `{ "error": "Unauthorized" }`,
      header `WWW-Authenticate: Bearer realm="authstar"`. No `authstar-return` cookie set, no
      redirect, not forwarded upstream.

### Tower `Deny`

- [ ] The response status is whatever tower's `Deny{status, reason}` specified (e.g. `401` for
      "not authenticated as far as this app is concerned," `403` for "authenticated but not
      permitted"). `Content-Type: application/json`, generic body (e.g.
      `{ "error": "Forbidden" }` for `403`-class responses) — `reason` is **never** included in
      the response body or headers.
- [ ] `reason` is logged server-side at a detail level sufficient for an operator to diagnose a
      misconfiguration or investigate an incident (ADR 0003). Tenant-scoped visibility into that
      log for application administrators is a real need but explicitly out of scope for
      portcullis itself (ADR 0003) — it's a future tower/web observability feature.
- [ ] Not forwarded upstream.

### `Unreachable`, fail-closed

- [ ] `503 Service Unavailable`, `Content-Type: application/json`, generic body (e.g.
      `{ "error": "temporarily unavailable" }`). The underlying error (tower connection
      failure, timeout, etc.) is logged server-side, not returned.
- [ ] Not forwarded upstream.

---

## Notes

- No response in any of these cases explains *why* a token was rejected, an account was denied,
  or tower was unreachable beyond the categories above — intentional, to avoid leaking
  information to a potentially hostile caller, matching `ref-design`'s original rationale for
  the plain `401` case and extended here to the other two.
- `WWW-Authenticate: Bearer realm="authstar"` is specific to the "no valid session" case per RFC
  6750 §3; it does not apply to `Deny` or `Unreachable` responses, which aren't about the
  bearer-token scheme itself.

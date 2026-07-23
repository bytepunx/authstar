# Story 019 — CORS Handling

**Epic:** Utility Endpoints
**Repo:** portcullis
**Status:** Draft
**Adapted from:** `ref-design` Story 019 — mechanics unchanged; origin config is now
tenant-scoped.

---

## Summary

Portcullis handles CORS preflight requests locally and attaches CORS headers to all responses,
using the resolved tenant's allowed origin configuration.

---

## Acceptance Criteria

- [ ] `OPTIONS` requests are handled locally, under the resolved tenant, and never forwarded
      upstream.
- [ ] `tenants.<slug>.cors.origin` accepts a single string or a list.
- [ ] For each request, the `Origin` header is checked against that tenant's configured allowed
      origins: matching origin → echoed in `Access-Control-Allow-Origin`; non-matching → CORS
      headers omitted (never echo back an unconfigured origin).
- [ ] CORS headers on matching-origin responses:

  | Header | Value |
  |--------|-------|
  | `Access-Control-Allow-Origin` | Matched origin |
  | `Access-Control-Allow-Credentials` | `true` |
  | `Access-Control-Allow-Methods` | `GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS` |
  | `Access-Control-Allow-Headers` | `Content-Type, Authorization` |
  | `Access-Control-Max-Age` | `86400` |

- [ ] Preflight `OPTIONS` responses return `204 No Content`.
- [ ] CORS headers are added to all responses (not just `OPTIONS`), including the WebSocket
      handshake request (Story 011a) — a browser still evaluates `Origin` on that request even
      though the WebSocket protocol itself doesn't consume `Access-Control-*` response headers.

---

## Notes

- `Access-Control-Allow-Credentials: true` is required since authentication relies on cookies —
  unchanged rationale from `ref-design`.
- Wildcard `*` is not supported for `Access-Control-Allow-Origin` when `Allow-Credentials: true`
  — unchanged, required by spec.
- `Access-Control-Allow-Headers` may need expanding in future stories if additional custom
  headers are introduced — unchanged.

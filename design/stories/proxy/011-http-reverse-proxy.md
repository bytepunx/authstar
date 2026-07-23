# Story 011 — HTTP Reverse Proxy Forwarding

**Epic:** Reverse Proxy
**Repo:** portcullis
**Status:** Draft
**Adapted from:** `ref-design` Story 011 — mechanics unchanged; upstream config is now
application-scoped (ADR 0016). WebSocket upgrade requests are handled by Story 011a instead of
falling under "out of scope."

---

## Summary

Portcullis forwards authenticated HTTP requests to the resolved application's upstream
service(s) and streams responses back to the client transparently.

---

## Acceptance Criteria

- [ ] All incoming HTTP methods are forwarded: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`.
      `OPTIONS` is handled locally by CORS (Story 019), not forwarded. A `Connection: Upgrade` /
      `Upgrade: websocket` request is handled by Story 011a instead of this story's normal
      request/response path.
- [ ] Request headers are forwarded with the following modifications:
      - `Authorization` is **replaced** with the internal JWT (Story 010), or removed if the
        request is unauthenticated.
      - `Host` is rewritten to match the upstream host.
      - `X-Forwarded-For`, `X-Forwarded-Proto`, and `X-Forwarded-Host` are set or appended.
- [ ] The request body, if any, is streamed to the upstream without buffering the full body in
      memory.
- [ ] `Proxy-Authorization` and `Proxy-Authenticate` are stripped from the client request before
      forwarding.
- [ ] The upstream response status, headers, and body are forwarded back unchanged, except
      standard hop-by-hop headers (`Connection`, `Keep-Alive`, `Transfer-Encoding`, `Upgrade`),
      which are stripped in both directions.
- [ ] If the resolved application's upstream is unreachable, portcullis returns `502 Bad Gateway`
      with `{ "error": "upstream unavailable" }`.
- [ ] If the upstream exceeds `tenants.<slug>.applications.<appSlug>.upstream.timeout` seconds
      (default 30), portcullis returns `504 Gateway Timeout`.
- [ ] The catch-all proxy target is `tenants.<slug>.applications.<appSlug>.upstream.base`. Any
      request not matched by a prefix route (Story 012) is forwarded here.

---

## Notes

- Use a connection-pooled HTTP client, reused across requests — unchanged from `ref-design`.
- Response streaming avoids loading large bodies into memory — unchanged.
- `Transfer-Encoding: chunked` is decoded and re-encoded as appropriate — unchanged.

---
title: "Story 012: Prefix-Based Multi-Upstream Routing"
updated: 2026-07-22
status: draft
---
# Story 012 — Prefix-Based Multi-Upstream Routing

**Epic:** Reverse Proxy
**Repo:** portcullis
**Status:** Draft
**Adapted from:** `ref-design` Story 012 — longest-prefix-match confirmed as final (the
reference flagged this as needing confirmation; adds an explicit tie-breaker rule).

---

## Summary

Portcullis routes requests to different upstream services within an application based on URL
path prefixes, so one application can front multiple backend services through a single
portcullis deployment.

---

## Acceptance Criteria

- [ ] `tenants.<slug>.applications.<appSlug>.upstream.routes` accepts entries of the form
      `<prefix>: <upstream URL>`, as an insertion-order-preserving map.
- [ ] For each incoming request (after application resolution), portcullis checks that
      application's configured prefixes.
- [ ] **The longest matching prefix wins.** If both `/api` and `/api/admin` are configured, a
      request to `/api/admin/users` routes to the `/api/admin` upstream.
- [ ] **Tie-breaker:** if two or more configured prefixes of *equal* length match the same
      request path (only possible with prefixes that are literally identical strings, since two
      distinct prefixes of the same length can't both be a prefix of the same path unless
      they're equal), the one defined **earlier** in the application's `upstream.routes`
      (insertion order) wins. In practice this resolves duplicate-key configuration mistakes
      deterministically rather than leaving them undefined behavior.
- [ ] When a prefix matches, it is **stripped** from the path before forwarding — `/library/books`
      with prefix `/library` becomes `/books`. An empty remaining path becomes `/`.
- [ ] If no prefix matches, the request is forwarded to the application's `upstream.base` (the
      catch-all) with the path unchanged.
- [ ] All prefix-route upstreams are subject to the same auth gate (Story 013) and header
      rewriting (Story 010) as the catch-all.
- [ ] Prefix routes are matched before the catch-all.

---

## Example Configuration

```yaml
tenants:
  acme:
    applications:
      main:
        upstream:
          base: http://web-service:4411
          routes:
            /api: http://api-service:4412
            /api/admin: http://admin-service:4413
            /assets: http://cdn-service:4414
```

## Example Routing

| Incoming path | Matched prefix | Upstream URL | Path sent to upstream |
|--------------|----------------|-------------|----------------------|
| `/api/users` | `/api` | `http://api-service:4412` | `/users` |
| `/api/admin/roles` | `/api/admin` | `http://admin-service:4413` | `/roles` |
| `/assets/logo.png` | `/assets` | `http://cdn-service:4414` | `/logo.png` |
| `/dashboard` | _(none)_ | `http://web-service:4411` | `/dashboard` |

---

## Notes

- Prefix matching is case-sensitive — unchanged from `ref-design`.
- Longest-prefix matching (vs. the original TypeScript reference's first-match-in-definition-order)
  was flagged in `ref-design` as a deliberate improvement pending confirmation — confirmed here,
  with the ordering tie-breaker added to fully define the previously-ambiguous equal-length case.

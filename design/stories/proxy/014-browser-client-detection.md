---
title: "Story 014: Browser vs API Client Detection"
updated: 2026-07-22
status: draft
---
# Story 014 — Browser vs API Client Detection

**Epic:** Reverse Proxy
**Repo:** portcullis
**Status:** Draft
**Adapted from:** `ref-design` Story 014 — unchanged; this is a pure function of the `Accept`
header with no tenant dependency.

---

## Summary

When an unauthenticated request hits a protected route, portcullis decides whether to redirect
(browser) or return `401` (API client) based on the request's `Accept` header.

---

## Acceptance Criteria

- [ ] A request is treated as a **browser** if it has no `Accept` header, or its `Accept` header
      contains `text/html`.
- [ ] A request is treated as an **API client** if `Accept` is present and does not contain
      `text/html`.
- [ ] Browser requests → save return URL cookie + redirect to the resolved tenant's
      `auth.loginUrl` (Story 007).
- [ ] API client requests → `401 Unauthorized` (Story 015).
- [ ] This detection is a pure function on the `Accept` header value, with no side effects and
      no tenant-specific behavior.

---

## Test Cases

| Accept header | Treated as |
|--------------|-----------|
| _(absent)_ | Browser |
| `text/html` | Browser |
| `text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8` | Browser |
| `application/json` | API client |
| `application/json, text/plain, */*` | API client |
| `*/*` | Browser (ambiguous case — default to the safer redirect, not a 401) |

---

## Notes

- The `*/*` case is a deliberate "when in doubt, redirect rather than 401" choice, matching the
  reference implementation — unchanged.
- Case-insensitive — unchanged.

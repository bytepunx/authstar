# Story 003 — Exempt Route Pattern Matching

**Epic:** Configuration
**Repo:** portcullis
**Status:** Draft
**Adapted from:** `ref-design` Story 003 — matching algorithm unchanged; source of the list changes.

---

## Summary

Certain paths must bypass authentication entirely. The proxy evaluates a per-tenant exempt
list against every incoming request URL, after tenant resolution, before deciding whether to
enforce authentication.

---

## Acceptance Criteria

- [ ] The exempt list is part of the requesting tenant's section (`tenants.<slug>.exempt`) of
      portcullis's single signet bundle (Story 001) — there is no `EXEMPT_ROUTES` environment
      variable merge and no separate per-tenant fetch; signet's git-reviewed config is the only
      source.
- [ ] For each incoming request, the path (without query string) is tested against every
      pattern in the resolved tenant's exempt list.
- [ ] Two pattern types are supported:
  - **Exact match:** `/health` matches only the path `/health`.
  - **Prefix wildcard:** `/api/public/*` matches `/api/public` and any path that starts with
    `/api/public/`. It does **not** match `/api/publicstuff`.
- [ ] Query strings are stripped before matching (e.g. `/health?check=1` is treated as
      `/health`).
- [ ] If a request matches any exempt pattern, authentication is not required and no
      `Authorization` header is injected — unless the request carries a valid session JWT
      (Story 013's opportunistic-auth behavior for exempt routes still applies).
- [ ] The exempt check is a pure function of (tenant's exempt list, request path) with no I/O,
      suitable for unit testing in isolation, run after tenant resolution has determined which
      tenant's list applies.

---

## Test Cases

| URL | Pattern | Match? |
|-----|---------|--------|
| `/health` | `/health` | Yes |
| `/health?check=1` | `/health` | Yes |
| `/healthz` | `/health` | No |
| `/api/public/users` | `/api/public/*` | Yes |
| `/api/public` | `/api/public/*` | Yes |
| `/api/publicstuff` | `/api/public/*` | No |
| `/api/private` | `/api/public/*` | No |

---

## Notes

- Pattern matching runs in O(n) over the exempt list — fine for the expected list sizes
  (< 50 patterns).
- No glob wildcards beyond the trailing `/*` are required at this stage.
- Because the list is now per-tenant, one tenant's exempt configuration can never
  inadvertently affect another's — this falls out naturally from tenant resolution running
  before this check, not from anything specific to this story.

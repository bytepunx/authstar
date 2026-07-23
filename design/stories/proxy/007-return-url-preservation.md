# Story 007 — Return URL Preservation and Post-Login Redirect

**Epic:** OAuth2 Authentication
**Repo:** portcullis
**Status:** Draft
**Adapted from:** `ref-design` Story 007/007a — mechanics unchanged; cookie attributes now
tenant-scoped.

---

## Summary

When an unauthenticated browser is redirected to login, portcullis saves the originally
requested URL in a short-lived cookie, scoped to the resolved tenant's cookie domain/path, and
returns the user there after successful authentication.

---

## Acceptance Criteria

- [ ] When an unauthenticated browser request is intercepted (Story 013), portcullis sets an
      `authstar-return` cookie containing the full request path + query string, using the
      resolved tenant's cookie `domain`/`path` (shared across the tenant's applications — ADR
      0016), before redirecting to the resolved application's `auth.loginUrl`.
- [ ] At the OAuth2 callback (Story 006), after issuing the session JWT, portcullis reads
      `authstar-return`.
- [ ] The return URL is validated with `is_safe_return_url` before use:
      - Must start with `/`.
      - Must **not** start with `//` (prevents protocol-relative redirect hijacking).
- [ ] If valid, redirect there; otherwise redirect to `/`. Absent cookie → redirect to `/`.
- [ ] The `authstar-return` cookie is cleared immediately after reading, regardless of whether
      it was used.

---

## Cookie Attributes

| Attribute | Value |
|-----------|-------|
| Name | `authstar-return` |
| Value | original request URL (path + query string) |
| httpOnly | true |
| Path | resolved tenant's `cookie.path` |
| Domain | resolved tenant's `cookie.domain` |
| MaxAge | 300 seconds |
| SameSite | `Lax` |

---

## `is_safe_return_url`

```
fn is_safe_return_url(url: &str) -> bool {
    url.starts_with('/') && !url.starts_with("//")
}
```

| URL | Safe? |
|-----|-------|
| `/dashboard` | Yes |
| `/app/settings?tab=profile` | Yes |
| `/` | Yes |
| `//evil.com` | No |
| `https://evil.com` | No |
| `javascript:alert(1)` | No |
| `` (empty) | No |

---

## Notes

- Unchanged from `ref-design`: 5-minute cookie lifetime is an accepted trade-off; the cookie is
  not signed since its content is validated before use and only ever redirected to relative
  paths.

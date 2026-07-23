# Story 004 — OIDC Provider Discovery

**Epic:** OAuth2 Authentication
**Repo:** portcullis
**Status:** Draft
**Adapted from:** `ref-design` Story 004 — discovery mechanics unchanged; scope is now per-tenant.

---

## Summary

At startup (and on every coordinated restart triggered by a bundle change — Story 001), for
every tenant's every configured provider, portcullis fetches that provider's OIDC discovery
document to learn its authorization, token, and userinfo endpoints.

---

## Acceptance Criteria

- [ ] For each tenant in the bundle's `tenants` map, and for each provider configured under
      `tenants.<slug>.providers`, portcullis fetches
      `<discoveryUrl>/.well-known/openid-configuration` (or the URL verbatim if it already ends
      with that path).
- [ ] Trailing slashes on `discoveryUrl` are normalised before constructing the well-known URL.
- [ ] All discovery fetches — across every tenant and every provider — run **concurrently**;
      startup time is bounded by the slowest single fetch, not the sum of all.
- [ ] The following fields are extracted from each discovery document: `authorization_endpoint`,
      `token_endpoint`, and `userinfo_endpoint` (required).
- [ ] Each discovery fetch has a 10-second timeout.
- [ ] Discovery results are stored alongside the provider config in an internal, per-tenant
      resolved-provider map used by the rest of the application.
- [ ] Discovery is performed once per process start only; there is no periodic refresh outside
      the normal bundle-change-triggered restart cycle.

### Per-tenant failure isolation

- [ ] A discovery failure (network error, non-2xx, timeout, or a missing `userinfo_endpoint`)
      for **one tenant's one provider** does **not** fail portcullis startup or affect any other
      tenant. That provider is marked unavailable for that tenant only — its login path returns
      a clear error (not a silent 404) and its entry is omitted from that tenant's `/oauth2/providers`
      listing (Story 017) — while every other tenant and every other provider continues to
      function normally.
- [ ] This is a deliberate departure from `ref-design` Story 004, which exits the whole process
      on any discovery failure — correct for a single-tenant deployment, wrong for a
      multi-tenant one where one tenant's misconfigured provider must not take down every other
      tenant's login flow.
- [ ] Each per-tenant/per-provider discovery failure is logged with enough detail
      (tenant, provider name, URL, HTTP status or error) for operators to diagnose it — subject
      to the same "detailed logging, nothing sensitive exposed to clients" posture established
      in ADR 0003.

---

## Notes

- See `docs/provider-examples.md` in the design repo (carried over from `ref-design`) for
  `discoveryUrl` values for common providers, plus the kluster `authstar` profile's local Dex
  instance for dev/test (fixed client `authstar` / `authstar-dev-secret` — ADR 0005).
- If **every** provider for a given tenant fails discovery, that tenant has no way to
  authenticate — this is a real operational state (fully misconfigured tenant) and should be
  visible to operators (metrics/alerting), not just a log line. Exact surfacing mechanism is
  not decided here.

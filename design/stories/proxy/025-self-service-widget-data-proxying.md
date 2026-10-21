---
title: "Story 025: Self-Service Widget Data Proxying (`/_authstar/me/*`)"
updated: 2026-08-01
status: draft
---
# Story 025 — Self-Service Widget Data Proxying (`/_authstar/me/*`)

**Epic:** Utility Endpoints
**Repo:** portcullis
**Status:** Draft
**New — not present in `ref-design`.** Per [ADR 0071](../../adrs/0071-self-service-widget-data-access.md).

---

## Summary

Portcullis proxies every path under `/_authstar/me/*` to whichever backend service owns that
data — tower, keep, or (for export only) `web` — so that embeddable Web Components (ADR 0072)
running inside an adopting application's own page can fetch the current user's own data without
that application needing any backend passthrough of its own.

---

## Acceptance Criteria

### Routing

- [ ] `/_authstar/me/*` is **not** exempt (Story 003) — the normal auth gate (Story 013) runs
      first, same as any other protected path. There is no anonymous case for "my own data."
- [ ] Routed by prefix, over SPIFFE mTLS (the same service-to-service pattern already used for
      tower/keep calls, Stories 010/021/022 — no new addressing mechanism, no new bundle field):

      | Prefix | Backend |
      |---|---|
      | `/_authstar/me/account` | tower |
      | `/_authstar/me/identities`, `/_authstar/me/identities/*` | tower |
      | `/_authstar/me/invite-codes` | tower |
      | `/_authstar/me/subscription` | keep |
      | `/_authstar/me/export` | `web` (`webUpstream`, same field/mechanism as Story 023) |
- [ ] This takes precedence over normal prefix routing (Story 012) for every path under
      `/_authstar/me/*`, same precedence rule Story 023 established for its own reserved paths.
- [ ] The forwarded internal JWT (Story 010) is attached exactly as it is for any other
      protected proxied request — no special-casing of the token itself. Tower's and keep's
      `/me/*` handlers resolve identity entirely from that token (ADR 0071); portcullis adds no
      accountId/tenantSlug parameter to the outbound request.
- [ ] Method and body pass through unmodified (`GET`/`DELETE` for reads/removal,
      `POST` for `/_authstar/me/invite-codes` creation) — this is a plain proxy, not a
      request-shape translation layer.

### No fallback behavior

- [ ] If the target backend is unreachable, the request fails the same way any other
      unreachable-upstream case does (`502`/`504`, Story 011) — there is no bare-bones
      equivalent to fall back to, same posture as `/_authstar/upgrade` (Story 023).

---

## Notes

- This story is the sibling of Story 023 (which proxies `/oauth2/select`/`/_authstar/upgrade`/
  `/_authstar/link/confirm` to `web` specifically) — the two together cover every reserved path
  portcullis proxies to a fixed backend rather than a tenant's own configured upstream. This one
  is the first to route to **more than one** backend by prefix, and the first where `web` is one
  option among several rather than the only target.
- Widgets never see or handle `tenantSlug`/`accountId` themselves — this is deliberate; the
  whole point of the `/me/*` shape (ADR 0071) is that a widget only ever needs to know "fetch
  from this path," identical across every tenant/application it happens to be embedded in.

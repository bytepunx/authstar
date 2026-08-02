# ADR 0050: `_portal` — a Second Reserved Application for Hosted Login and Billing Pages

- **Status:** Accepted
- **Date:** 2026-08-01
- **Affects:** tower, portcullis, web
- **Extends:** [ADR 0044](0044-web-surfaces-and-distribution-model.md)
- **Fixes a gap found while designing:** [ADR 0051](0051-web-applications-and-identity-access-screens.md)

## Context

ADR 0044 established `_admin` as the reserved, auto-provisioned tenant application for `web`'s
admin surface, and separately said `web` serves hosted, tenant-branded login and payment-entry
pages — but never gave those pages a reserved application of their own. Routing fully public,
unauthenticated, 100%-of-traffic login pages through the same application as the sensitive,
permission-gated admin surface would blur exactly the trust boundary this design has repeatedly
split services over elsewhere (`steward`/`web`, `lookout`/`chronicle`, herald's two signing
keys) — a compromise or outage of the public login page shouldn't share blast radius with the
admin surface, and vice versa.

## Decision

### `_portal` — a second reserved, auto-provisioned application per tenant

Same convention as `_admin` (ADR 0044): underscore-reserved slug, created automatically at
tenant creation, never deletable, excluded from the normal Applications list an admin manages
(ADR 0051). Hosts:

- The tenant-branded sign-in/provider-selection page — replacing portcullis's bare
  `/oauth2/select` default (Story 018) as the target of `auth.loginUrl`.
- The plan-selection/upgrade page — calls `keep`'s `checkout-sessions` endpoint and redirects
  to Stripe's own hosted Checkout, rather than `web` building any payment UI itself (ADR 0044's
  PCI reasoning, unchanged).

### Every application's `auth.loginUrl` — including `_admin`'s own — defaults to `_portal`

One tenant-branded login experience, written once, shared across every application in the
tenant rather than each maintaining its own. This means `_portal` must exist and be reachable
before `_admin` can meaningfully serve anyone — the same bootstrap ordering ADR 0044 already
established for `_admin` itself relative to ADR 0021's CLI-issued invite flow.

### Public vs. lightly-authenticated pages within `_portal` share one application

Login pages are hit by 100% of traffic, fully unauthenticated. Plan-selection/upgrade pages are
hit by a much smaller population and are typically reached *already authenticated* (upgrading
is a self-service action on one's own account). Both still benefit from being tenant-branded
and served by `web` rather than the tenant's own product — the trust boundary that actually
mattered was separating from `_admin`'s elevated surface, which is achieved either way. Story
003's existing exempt-list mechanism (per-application, already supports mixed public/protected
paths) is sufficient to distinguish the two within `_portal` — no further splitting needed.

## Consequences

- Tenant auto-provisioning now creates **two** reserved applications, not one.
- `web`'s Applications section (ADR 0051) must exclude or specially mark both `_admin` and
  `_portal` — misconfiguring either could be catastrophic (losing access to login or admin
  entirely).
- Story 018 (multi-provider selection page) is effectively superseded as the *default* login
  experience per tenant — portcullis's built-in page remains the fallback only until `_portal`
  is reachable, not the intended steady-state UX.

## Related

- [ADR 0016](0016-application-layer-and-sso-scope.md), [ADR 0021](0021-cli-operator-bootstrap.md), [ADR 0044](0044-web-surfaces-and-distribution-model.md), [ADR 0045](0045-steward-operator-console.md) (the trust-boundary-split precedent this follows), [ADR 0051](0051-web-applications-and-identity-access-screens.md)

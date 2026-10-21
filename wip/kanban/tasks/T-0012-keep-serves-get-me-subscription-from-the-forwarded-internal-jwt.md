---
id: T-0012
type: task
nature: feature
title: Keep serves GET /me/subscription from the forwarded internal JWT
status: done
parent: S-0006
owner: alex
created: 2026-10-21T05:33:53Z
updated: 2026-10-21T05:39:18Z
transitions:
  - to: ready
    at: 2026-10-21T05:33:54Z
    by: claude
  - to: in-progress
    at: 2026-10-21T05:33:54Z
    by: claude
  - to: done
    at: 2026-10-21T05:39:18Z
    by: claude
stream: S-0006
tags: []
touches: [keep]
---
# T-0012 Keep serves GET /me/subscription from the forwarded internal JWT

## Work

Add `keep/src/routes/me.ts`: resolve tenant and account from `request.authstar`, find the account-scoped subscription, join the plan name from the plan mapping, return `{ status, planName, currentPeriodEnd }` or nulls when none; 403 for a missing, degraded, or account-less token. Register it in `build-app.ts`; behavior spec beside the others.

## Done when

- `npm test` in keep passes with the new spec covering found, none, degraded, and cross-tenant cases; `keep/TESTING.md` lists the route as implemented.

## Notes

Story keep/006 and ADR-0071 fix the shape. With more than one subscription for the account, the live one wins over a canceled one.

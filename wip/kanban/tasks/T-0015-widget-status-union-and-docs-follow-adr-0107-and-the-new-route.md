---
id: T-0015
type: task
nature: feature
title: Widget status union and docs follow ADR-0107 and the new route
status: done
parent: S-0006
owner: alex
created: 2026-10-21T05:34:23Z
updated: 2026-10-21T05:39:59Z
transitions:
  - to: ready
    at: 2026-10-21T05:39:18Z
    by: claude
  - to: in-progress
    at: 2026-10-21T05:39:18Z
    by: claude
  - to: done
    at: 2026-10-21T05:39:59Z
    by: claude
stream: S-0006
tags: []
touches: [web/src/widgets, docs/users]
---
# T-0015 Widget status union and docs follow ADR-0107 and the new route

## Work

Widen the widget's `SubscriptionInfo.status` to Stripe's full status set, describe the widget and its endpoint in `docs/users/index.md`, and note the route in `keep/TESTING.md` and `portcullis/TESTING.md`.

## Done when

- `npm test` in web passes; `flai check --strict` passes.

## Notes

The widget renders any non-null status as text, so widening the type changes no behaviour.

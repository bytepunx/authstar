---
id: D-0047
title: Keep's GET /me/subscription reports a live subscription before an ended one, newest first, when an account has more than one
kind: decision
sources: [S-0006]
topics: [keep, billing, node]
paths: [keep/src/routes/me.ts, keep/spec/behavior/me.spec.ts, design/stories/keep/006-self-service-config-and-activity.md]
date: 2026-11-14
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0047 Keep's GET /me/subscription reports a live subscription before an ended one, newest first, when an account has more than one

Story keep/006 (`design/stories/keep/006-self-service-config-and-activity.md` § `GET /me/subscription`) describes the route as resolving "the caller's own account-scoped `subscription`", as if an account had one. It does not say which to report when it has several.

S-0006 decided it. Its narrative's Decisions: "With more than one subscription for an account, the route reports a live one before an ended one, newest first; story keep/006 speaks of one subscription and does not say."

In `keep/src/routes/me.ts`, a subscription has ended when its status is `canceled` or `incomplete_expired`. The route sorts the account's subscriptions newest first by `createdAt` and takes the first that has not ended, else the newest. A story that changes what the widget shows, or adds another self-service route over subscriptions, keeps this rule or changes it on purpose.

Source: S-0006.

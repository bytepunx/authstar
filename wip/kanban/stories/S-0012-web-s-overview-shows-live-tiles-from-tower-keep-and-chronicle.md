---
id: S-0012
type: story
nature: feature
title: Web's Overview shows live tiles from tower, keep, and chronicle
status: backlog
parent: E-0004
owner: alex
created: 2026-10-21T05:13:43Z
updated: 2026-10-21T05:13:44Z
transitions: []
tags: []
after: [S-0009, S-0010]
---
# S-0012 Web's Overview shows live tiles from tower, keep, and chronicle

## Goal

The Overview screen ADR-0061 and story web/002 describe shows the tenant's real numbers: accounts and applications from tower, subscription and revenue summary from keep, and the auth funnel and active users from chronicle, each tile degrading to an explicit "unavailable" when its source fails.

## Acceptance criteria
- [ ] Web has a chronicle client authenticated with the forwarded internal JWT
- [ ] The Overview renders the tiles story web/002 lists, each from its live source, with loading and unavailable states
- [ ] The analytics section renders chronicle's auth funnel and active users as charts
- [ ] Behavior tests against the fake backends cover every tile state; the integration harness shows non-zero funnel numbers after a scripted login

## Tasks

## Notes

Waits for S-0009 and S-0010 so the numbers are real. Charting library choice is a `design/tech` entry.

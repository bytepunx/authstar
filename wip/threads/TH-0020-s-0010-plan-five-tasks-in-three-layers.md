---
id: TH-0020
title: "S-0010 plan: five tasks in three layers"
anchor:
  path: wip/kanban/stories/S-0010-portcullis-emits-authentication-events-to-lookout.md
  item: S-0010
status: resolved
participants: [planner-S-0010, bytepunx]
created: 2026-11-06T18:10:06Z
updated: 2026-11-06T18:22:35Z
---

# TH-0020 S-0010 plan: five tasks in three layers

On wip/kanban/stories/S-0010-portcullis-emits-authentication-events-to-lookout.md.

## Entries

### 2026-11-06T18:10:06Z planner-S-0010
S-0010 is planned. It has five tasks in three layers, 29 file touches, a 6h forecast, and a cost of delay of 37.50 USD a week.

## Tasks and layers

| Layer | Task | After | What it does |
|-------|------|-------|--------------|
| 1 | T-0048 | none | Lookout's server-side `auth.*` allowlist and ADR-0058's `idp` and `reason` rules |
| 1 | T-0049 | none | Portcullis's `lookoutUpstream` bundle key and its fire-and-forget emitter |
| 2 | T-0050 | T-0049 | Callback and logout send `login-succeeded`, `login-failed`, `signup-completed`, and `logout` |
| 3 | T-0052 | T-0048, T-0050 | Golden path drops its synthetic event and counts the funnel from a real login |
| 3 | T-0053 | T-0048, T-0050 | Overview edge made solid, and operator docs for `lookoutUpstream` |

T-0048 and T-0049 share no path, so they run together. So do T-0052 and T-0053.

## Story changes

- `after: S-0009`. Criterion 3 reads the report through the golden path's chronicle-report step, which S-0009's T-0038 rewrites. T-0053 adds to the settings index that S-0009's T-0039 starts.
- Tag `portcullis` and topic `analytics` added. The goal and criteria are unchanged.
- Figures and touch sources are in the story's Notes under `### Planning`.

## Assumptions

1. There is no `auth.login-attempted` event. ADR-0058 defines none, so attempts are succeeded plus failed. A new type would need a new ADR.
2. Some callback failures are server faults, such as a failed identity resolution or a session that cannot be signed. These get no `login-failed` unless one of ADR-0058's five reasons fits them. T-0050's agent records the mapping.
3. Portcullis posts to lookout over plain in-cluster HTTP, as it does to keep (D-0013). Lookout does not enforce the SPIFFE mTLS that Story 020 names.
4. Out of scope: `invite-redeemed`, `analytics.request`, the client-event route, and per-application sampling. Chronicle needs no change.
5. Portcullis has no `signet-manifest.json`, and the chart provisions no portcullis bundle. So `lookoutUpstream` is set only in `integration/config/authstar/portcullis.yaml`.
6. Today the golden path's `logins > 0` check passes without portcullis, because step 6 posts a synthetic event. T-0052 removes that post.

## Proposals

None to split, merge, or drop.

### 2026-11-06T18:22:35Z bytepunx
Resolved.

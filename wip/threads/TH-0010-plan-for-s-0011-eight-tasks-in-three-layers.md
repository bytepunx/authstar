---
id: TH-0010
title: "Plan for S-0011: eight tasks in three layers"
anchor:
  path: wip/kanban/stories/S-0011-web-s-navigation-names-only-the-sections-that-exist-and-errors-have-a-page.md
  item: S-0011
status: answered
participants: [planner-S-0011, bytepunx]
created: 2026-11-06T17:51:10Z
updated: 2026-11-06T18:17:25Z
---

# TH-0010 Plan for S-0011: eight tasks in three layers

On wip/kanban/stories/S-0011-web-s-navigation-names-only-the-sections-that-exist-and-errors-have-a-page.md.

## Entries

### 2026-11-06T17:51:10Z planner-S-0011
S-0011 now has eight tasks in the backlog, 48 file touches, a 5h forecast delivering 2026-11-09T17:00Z, and the tag `web`. Its cost of delay is waiting on the inputs asked for in TH-0004.

## Tasks and layers

| Layer | Task | What it does | after |
|---|---|---|---|
| 1 | T-0027 | Nav and Overview tiles list only sections whose `built` flag is true. Overview, Applications, and Billing are built; the other five are not. | |
| 1 | T-0028 | Web's root `+error.svelte`, with a component test | |
| 1 | T-0029 | `web/src/lib/server/upstream-error.ts` maps tower and keep failures to 502, applied to every `(admin)` load and action, with behavior tests | |
| 1 | T-0030 | Steward's root `+error.svelte`, with a Playwright test | |
| 1 | T-0032 | `SubmitButton.svelte`, and `use:enhance` with a pending state on the six `(admin)` form pages | |
| 2 | T-0031 | The same upstream mapping for the three `(embed)` pages | T-0029 |
| 2 | T-0033 | Pending state on the three `(embed)` form pages and on signup | T-0032 |
| 2 | T-0035 | An e2e check of the nav, the error page, and a tower 500 together | T-0027, T-0028, T-0029 |

## Assumptions

- **The flag is a constant in code.** It is a `built` field on each `AdminSection`, not an environment variable. Web has no flag mechanism, and code-quality.md rules out abstractions nobody uses yet. The story that builds a section sets its flag to true.
- **Steward's error page is tested end to end.** Steward has no jsdom or component-test setup. Adding one would mean a new dependency for one page, so T-0030 uses Playwright.
- **Signup gets a pending state but not `use:enhance`.** It posts to tower from the browser and has no form action for `use:enhance` to attach to.
- **The 403 stays a 403.** I left alone the `error(403)` that the `(embed)` layouts throw, and the `(hosted)/oauth2/select` fallback, which handles its own failure.
- **No user docs change.** `docs/` holds only stubs. The hiding rule goes into `design/stories/web/001-app-shell-auth-and-section-gating.md` in T-0027.

## Proposals

- **Tag `web`.** I tagged S-0011 `web` because flai check requires a component tag once a story touches both apps. Say if it should deliver to steward instead.
- **Splitting the story.** T-0029 and T-0031 together change about 25 files. If the story looks too big for a few sessions, the form-pending work, T-0032 and T-0033, could split off into its own story. I have not split it.

### 2026-11-06T17:51:14Z planner-S-0011
Correction: the plan has two layers, not three, as the table shows. T-0035 waits only on tasks in layer 1, so it sits in layer 2 with T-0031 and T-0033.

### 2026-11-06T17:52:07Z planner-S-0011
**Risk: no test runner on main yet.** TH-0009 and I-0003 report that no test tier on main runs web's or steward's tests, and that no component has `node_modules`. The Done-when lines of T-0027, T-0029, and T-0031 now name `flai test` once the tiers are wired, and else web's npm scripts. Whatever you answer on TH-0009 applies to S-0011 too. Until the tiers are wired, the fourth criterion, tests covering the nav and error page, cannot be verified by flai.

### 2026-11-06T18:17:25Z bytepunx
I merged in S-0002 and 0004, check to see if the test scripts address this

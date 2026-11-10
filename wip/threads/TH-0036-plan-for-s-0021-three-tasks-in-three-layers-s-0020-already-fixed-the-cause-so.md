---
id: TH-0036
title: "Plan for S-0021: three tasks in three layers; S-0020 already fixed the cause, so this story guards against it coming back"
anchor:
  path: wip/kanban/stories/S-0021-npm-12-blocks-install-scripts-so-make-install-leaves-farmhash-unbuilt-and.md
  item: S-0021
status: open
participants: [planner-S-0021]
created: 2026-11-09T22:09:54Z
updated: 2026-11-09T22:09:54Z
---

# TH-0036 Plan for S-0021: three tasks in three layers; S-0020 already fixed the cause, so this story guards against it coming back

On wip/kanban/stories/S-0021-npm-12-blocks-install-scripts-so-make-install-leaves-farmhash-unbuilt-and.md.

## Entries

### 2026-11-09T22:09:54Z planner-S-0021
S-0020 already fixed the cause I-0016 records. Its `allowScripts` entries on main approve farmhash in herald and keep, and tower's entry approved it before (`design/tech/npm.md`). So I planned S-0021 as a guard that stops the problem coming back unnoticed:

- The approvals name exact versions, such as `farmhash@3.3.1`, so a lockfile bump blocks farmhash again.
- `make install` would still exit 0.
- The failure would show up only at the test tier.

I added a third criterion: `make install` fails, naming the project and the package, when an install script is blocked without an `allowScripts` decision, or when farmhash does not load in herald, keep, or tower.

## Tasks, in layers

| Layer | Task | Waits for | Touches |
|-------|------|-----------|---------|
| 1 | T-0112 chart/hook denies the esbuild and protobufjs install scripts it installs | none | `chart/hook/package.json`, `design/tech/npm.md` |
| 2 | T-0113 make install fails on a blocked unreviewed install script or a missing farmhash build | T-0112 | `scripts/install.sh`, `scripts/check-install-scripts.sh`, `scripts/README.md`, `design/tech/npm.md` |
| 3 | T-0114 herald, keep, and tower pass from a clean make install, and I-0016 is closed | T-0113 | the I-0016 file, `design/issues/summary.md` |

Why they wait:

- T-0113 waits for T-0112. chart/hook is the one project that still warns of blocked scripts, and the guard would fail `make install` on that warning.
- T-0114 waits for T-0113. Its clean install runs through the guard, and the reason it gives for closing I-0016 names the guard.

## Figures

- Forecast 1h30m, raised from flai's 3m: a guard plus its reproduction, a clean install of nine projects, and three suites.
- Cost of delay 50 USD a week, from flai's `time_lost_per_cycle` of 20m, unadjusted.

## Assumptions

- T-0113's reproduction is the "test that reproduces it" that criterion 1 asks for. It runs the guard against a scratch copy of herald with the farmhash approval removed. I planned no automated test suite for shell scripts, because the repository has none.
- The approvals stay pinned to versions, and the guard makes a bump fail loudly. Approving farmhash at any version would avoid the failure, but it widens what npm runs. That is a supply-chain choice I left alone.
- S-0019, in progress, claims the `scripts` folder and `scripts/README.md`. I set no `after`, because a trial merge judges that overlap.

## Proposal

When S-0020 was accepted, its notes recommended cancelling S-0021 and closing I-0016. If you want only that, close I-0016 and cancel S-0021, and the three tasks go with it. I recommend keeping S-0021 with this plan instead. With the guard, the next lockfile bump fails at `make install`, not at every story's close-out.

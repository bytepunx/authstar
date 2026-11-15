---
id: S-0021
type: story
nature: remediation
title: npm 12 blocks install scripts, so make install leaves farmhash unbuilt and herald, keep, and tower's tests fail
status: in-progress
owner: bytepunx
created: 2026-11-09T09:04:33Z
updated: 2026-11-14T18:11:11Z
transitions:
  - to: ready
    at: 2026-11-14T10:09:01Z
    by: bytepunx
  - to: in-progress
    at: 2026-11-14T10:21:56Z
    by: agent-S-0021
  - to: review
    at: 2026-11-14T17:58:50Z
    by: agent-S-0021
  - to: in-progress
    at: 2026-11-14T18:02:17Z
    by: flai
blocked:
  - from: 2026-11-14T11:45:30Z
    until: 2026-11-14T17:49:29Z
    reason: awaiting the operator on TH-0062
  - from: 2026-11-14T18:11:11Z
    reason: awaiting the operator on TH-0065
tags: [hook]
topics: [dependencies, testing]
touches: [chart/hook/package.json, scripts/install.sh, scripts/check-install-scripts.sh, scripts/README.md, design/tech/npm.md, design/issues/I-0016-npm-12-blocks-install-scripts-so-make-install-leaves-farmhash-unbuilt-and.md, design/issues/summary.md, design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md, design/issues/I-0018-herald-s-retention-purge-spec-fails-intermittently-with-ntp-clock-skew-detected.md, design/issues/I-0019-flai-check-finds-roles-definition-outside-the-story-at-close-out.md, design/issues/I-0035-golden-path-s-login-races-tower-s-restart-after-tenant-provisioning-changes-its.md]
agent:
  harness: claude-code
  model: claude-opus-5-5
  config:
    effort: high
usage:
  source: log
  seconds: 6183
  priced_by: harness
  turns:
    - day: 2026-11-14
      ceremony: 3
      hand_edits: 1
      work: 207
  models:
    - model: claude-opus-5-5
      input: 502
      output: 71231
      cache_read: 57599635
      cache_write: 783440
      cost: 18.7236
  strategic:
    - kind: orchestrator
      seconds: 140
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 79
          output: 560
          cache_read: 2281692
          cache_write: 333486
          cost: 2.9308
cost_of_delay:
  inputs:
    time_lost_per_cycle: 20m
    by: flai
    at: 2026-11-09T09:04:33Z
  value: 50
  by: planner-S-0021
  at: 2026-11-09T22:09:10Z
forecast:
  duration: 1h30m
  delivery: 2026-11-17T03:30:00Z
  basis: "Its own forecast of 1h30m; 9th in the pull order with an in-progress limit of 4, behind S-0013, S-0012, S-0007, S-0008, S-0010, S-0014, S-0015, S-0016 and S-0018."
  by: flai
  at: 2026-11-14T09:55:08Z
finalized:
  by: bytepunx
  at: 2026-11-09T22:47:32Z
---
# S-0021 npm 12 blocks install scripts, so make install leaves farmhash unbuilt and herald, keep, and tower's tests fail

## Goal

This story remediates [I-0016](../../../design/issues/I-0016-npm-12-blocks-install-scripts-so-make-install-leaves-farmhash-unbuilt-and.md), "npm 12 blocks install scripts, so make install leaves farmhash unbuilt and herald, keep, and tower's tests fail". The issue recommends no solution yet: propose one from its instances before building it.

## Acceptance criteria
- [x] The cause I-0016 describes no longer occurs, with a test that reproduces it where one fits
- [x] I-0016 is closed with `flai issue close I-0016 --reason` saying what fixed it
- [x] `make install` fails, naming the project and the package, when npm blocks an install script that the project's `allowScripts` neither approves nor denies, or when farmhash's native module is missing after the install in herald, keep, or tower

## Tasks
- T-0112 chart/hook denies the esbuild and protobufjs install scripts it installs
- T-0113 make install fails on a blocked unreviewed install script or a missing farmhash build
- T-0114 herald, keep, and tower pass from a clean make install, and I-0016 is closed

## Notes

Cost of delay inputs set by flai from I-0016. time_lost_per_cycle 20m: 20m per occurrence × 1 occurrence ÷ 1 cycle of 168h (first reported 2026-11-09T07:17:12Z, 0.1 days before this story; under one cycle counts as one).

### Planning

Written by planner-S-0021 on 2026-11-09. The plan is summarised in the plan's thread on S-0021.

Proposed solution: S-0020, accepted on 2026-11-09, already fixed the cause. Its `allowScripts` entries approve farmhash in herald and keep, and tower's entry approved it before ([design/tech/npm.md](../../../design/tech/npm.md)). What is left is to stop it coming back without anyone noticing. The approvals name exact versions (`farmhash@3.3.1`), so a lockfile bump would block farmhash again. `make install` would still exit 0, and the failure would show up only at the test tier, as `Cannot find module './build/Debug/farmhash.node'`. This story makes `make install` fail at once in two cases:

- an unreviewed install script is blocked;
- farmhash's native module is missing after the install.

It also gives chart/hook the deny entries it lacks, since it is the one project that still warns. Criterion 3 states this.

Touches. The story declared none, and `flai touches suggest` had nothing to start from. Each touch comes from the issue, the design, or the layout:

- `scripts/install.sh` (layout): `make install` runs it, and the issue names it.
- `scripts/check-install-scripts.sh` (layout): a new script for the guard, so that `install.sh` stays one loop.
- `scripts/README.md` (layout): lists every script.
- `chart/hook/package.json` (design): `design/tech/npm.md` says chart/hook has no entry, so `npm ci` warns that esbuild and protobufjs are blocked.
- `design/tech/npm.md` (design): records the approvals and now the guard.
- The I-0016 file and `design/issues/summary.md` (issue): `flai issue close` writes them.

No folder touch is kept. S-0019, in progress, claims the `scripts` folder and `scripts/README.md`; a trial merge judges that overlap, so no `after` is given.

Tags and topics: `hook` is the component whose files change. `dependencies` and `testing` are what the story is about.

Forecast: `flai forecast` gave 3m: a median of 66 s per unit of size over three done remediation stories, times a size of 2. It was raised to 1h30m for three pieces of work:

- writing the guard and reproducing the failure with an approval removed;
- a clean `make install` across nine npm projects;
- herald's, keep's, and tower's suites.

The delivery moves by the same 1h27m, from flai's 2026-11-10T08:59Z.

Cost of delay: 50 USD a week, as `flai cod` works it out, unadjusted. It comes from flai's input from I-0016, `time_lost_per_cycle` 20m: 20m lost per 168h cycle at 150 USD an hour. No revenue or penalty is set. That fits a remediation whose cause is already fixed.

After: none. The story reads S-0020's `allowScripts` entries, which are already on main.
- 2026-11-14T18:02:17Z: moved to in-progress: flai serve's checks of S-0021 against its kluster namespace ended failed, at the check golden-path, at commit 7b19fc1ce549

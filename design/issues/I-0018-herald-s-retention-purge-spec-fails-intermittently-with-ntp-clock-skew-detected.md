---
id: I-0018
title: "Herald's retention-purge spec fails intermittently with \"NTP clock skew detected\" from node-flakes"
class: defect
status: closed
count: 2
cost: 8m
first_reported: 2026-11-09T07:58:27Z
last_reported: 2026-11-14T11:15:13Z
updated: 2026-11-14T17:50:02Z
---

# I-0018 Herald's retention-purge spec fails intermittently with "NTP clock skew detected" from node-flakes

## Description
Herald's retention-purge spec fails intermittently with "NTP clock skew detected" from node-flakes

## Instances

### 2026-11-09T07:58:27Z
Story: S-0011.
In S-0011's worktree, one `flai test` run failed in herald's `spec/behavior/retention-purge.spec.ts`, case "respects each communicationType's own retentionDays independently", with `Error: NTP clock skew detected` from `node-flakes` (via consequent's `enrichEvent`). S-0011 changed nothing in herald. The next run passed unchanged. The whole test tier runs every project (I-0010), so a flake in any one fails every story's test run and costs another 8 to 10 minutes.

### 2026-11-14T11:15:13Z
Story: S-0021.
Keep, not herald, this time, so it is probably the same cause; the error text was not captured. S-0021's close-out job S-0021-20261114T111359Z stopped at the test tier after 33s. One keep test failed: `keep/spec/behavior/webhook-disputes.spec.ts:59`, where activate() posted `customer.subscription.created` and got 500, not 200. 238 of 239 tests passed. The same spec passed in S-0021's three earlier close-outs and two `flai test` runs, at the same commit, and S-0021 changes no keep file. Keep makes its ids with `node-flakes` (`keep/src/lib/ids.ts`), whose `dist/index.js` throws "NTP clock skew detected". The job log keeps only the assertion, not the 500's body, so that error is the likely cause, not a confirmed one.

## Remediation

Story S-0023 remediates this issue, created from it at 2026-11-09T09:04:34Z.
Closed 2026-11-14T17:50:02Z: S-0023. node-flakes 2.1.0 throws "NTP clock skew detected" when Date.now() steps back, and consequent 2.0.1 offers no clock injection. herald's and keep's vitest runs now load spec/lib/monotonic-clock.ts as a setup file, which keeps Date.now() monotonic. spec/behavior/clock-skew.spec.ts in each project reproduces the throw with a raw clock stepped back and shows the guard holds. The production exposure is I-0033.

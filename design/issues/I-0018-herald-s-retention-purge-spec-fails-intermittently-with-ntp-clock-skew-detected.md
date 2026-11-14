---
id: I-0018
title: "Herald's retention-purge spec fails intermittently with \"NTP clock skew detected\" from node-flakes"
class: defect
status: closed
count: 1
cost: 10m
first_reported: 2026-11-09T07:58:27Z
last_reported: 2026-11-09T07:58:27Z
updated: 2026-11-14T17:50:02Z
---

# I-0018 Herald's retention-purge spec fails intermittently with "NTP clock skew detected" from node-flakes

## Description
Herald's retention-purge spec fails intermittently with "NTP clock skew detected" from node-flakes

## Instances

### 2026-11-09T07:58:27Z
Story: S-0011.
In S-0011's worktree, one `flai test` run failed in herald's `spec/behavior/retention-purge.spec.ts`, case "respects each communicationType's own retentionDays independently", with `Error: NTP clock skew detected` from `node-flakes` (via consequent's `enrichEvent`). S-0011 changed nothing in herald. The next run passed unchanged. The whole test tier runs every project (I-0010), so a flake in any one fails every story's test run and costs another 8 to 10 minutes.

## Remediation

Story S-0023 remediates this issue, created from it at 2026-11-09T09:04:34Z.
Closed 2026-11-14T17:50:02Z: S-0023. node-flakes 2.1.0 throws "NTP clock skew detected" when Date.now() steps back, and consequent 2.0.1 offers no clock injection. herald's and keep's vitest runs now load spec/lib/monotonic-clock.ts as a setup file, which keeps Date.now() monotonic. spec/behavior/clock-skew.spec.ts in each project reproduces the throw with a raw clock stepped back and shows the guard holds. The production exposure is I-0033.

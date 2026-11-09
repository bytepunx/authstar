---
id: I-0018
title: "Herald's retention-purge spec fails intermittently with \"NTP clock skew detected\" from node-flakes"
class: defect
status: open
count: 1
cost: 10m
first_reported: 2026-11-09T07:58:27Z
last_reported: 2026-11-09T07:58:27Z
updated: 2026-11-09T09:04:34Z
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

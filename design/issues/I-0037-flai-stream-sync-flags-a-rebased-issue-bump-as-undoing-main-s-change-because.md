---
id: I-0037
title: flai stream sync flags a rebased issue bump as undoing main's change, because the issue's count line changes on both sides
class: efficiency
status: open
count: 1
cost: 10m
first_reported: 2026-11-15T05:54:56Z
last_reported: 2026-11-15T05:54:56Z
updated: 2026-11-15T05:54:56Z
---

# I-0037 flai stream sync flags a rebased issue bump as undoing main's change, because the issue's count line changes on both sides

## Description
flai stream sync flags a rebased issue bump as undoing main's change, because the issue's count line changes on both sides

## Instances

### 2026-11-15T05:54:56Z
Story: S-0023.
Rebasing S-0023 onto main (TH-0069), flai merged I-0010's instances from both sides, but left `count: 9` from S-0023's old base, while main had `count: 8` from S-0015's bump. The file holds 10 instances, so S-0023 set `count: 10` by hand (commit after the rebase). The sync still warns "story/S-0023 removes 1 line main added to design/issues/I-0010-…" because main's `count: 8` line is replaced. No count avoids that warning, so acceptance needs `flai accept S-0023 --keep-removal <path> --reason`. The issue merge that keeps both sides' instances could recount `count` from the instances and stop treating the replaced count line as a removal.

## Remediation

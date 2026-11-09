---
id: I-0019
title: "flai check finds `roles.definition` outside the story at close-out"
class: efficiency
status: open
count: 3
first_reported: 2026-11-09T08:08:05Z
last_reported: 2026-11-09T22:45:44Z
updated: 2026-11-09T22:45:44Z
---

# I-0019 flai check finds `roles.definition` outside the story at close-out

## Description
flai check finds `roles.definition` outside the story at close-out

## Instances

### 2026-11-09T08:08:05Z
Story: S-0011.
flai check found outside the story:
`design/workflows/roles/orchestrator.md`: definition.tools lists mcp__flai__verify, which the role's rules refuse: verify is neither a read every agent has nor in tools or a permission's tools; remove it, or grant it

### 2026-11-09T09:41:10Z
Story: S-0020.
flai check found outside the story:
`design/workflows/roles/orchestrator.md`: definition.tools lists mcp__flai__verify, which the role's rules refuse: verify is neither a read every agent has nor in tools or a permission's tools; remove it, or grant it

### 2026-11-09T22:45:44Z
Story: S-0019.
flai check found outside the story:
`design/workflows/roles/orchestrator.md`: definition.tools lists mcp__flai__verify, which the role's rules refuse: verify is neither a read every agent has nor in tools or a permission's tools; remove it, or grant it

## Remediation

Story S-0024 remediates this issue, created from it at 2026-11-09T09:04:35Z.

---
id: I-0015
title: "flai check finds `roles.definition` outside the story at close-out"
class: efficiency
status: open
count: 1
first_reported: 2026-11-09T07:16:37Z
last_reported: 2026-11-09T07:16:37Z
updated: 2026-11-09T07:16:37Z
---

# I-0015 flai check finds `roles.definition` outside the story at close-out

## Description
flai check finds `roles.definition` outside the story at close-out

## Instances

### 2026-11-09T07:16:37Z
Story: S-0006.
flai check found outside the story:
`design/workflows/roles/orchestrator.md`: definition.tools lists mcp__flai__verify, which the role's rules refuse: verify is neither a read every agent has nor in tools or a permission's tools; remove it, or grant it

## Remediation

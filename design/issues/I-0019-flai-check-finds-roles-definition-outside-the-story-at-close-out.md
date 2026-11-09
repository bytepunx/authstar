---
id: I-0019
title: "flai check finds `roles.definition` outside the story at close-out"
class: efficiency
status: open
count: 1
first_reported: 2026-11-09T08:08:05Z
last_reported: 2026-11-09T08:08:05Z
updated: 2026-11-09T08:08:05Z
---

# I-0019 flai check finds `roles.definition` outside the story at close-out

## Description
flai check finds `roles.definition` outside the story at close-out

## Instances

### 2026-11-09T08:08:05Z
Story: S-0011.
flai check found outside the story:
`design/workflows/roles/orchestrator.md`: definition.tools lists mcp__flai__verify, which the role's rules refuse: verify is neither a read every agent has nor in tools or a permission's tools; remove it, or grant it

## Remediation

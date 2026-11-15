---
id: I-0019
title: "flai check finds `roles.definition` outside the story at close-out"
class: efficiency
status: open
count: 11
first_reported: 2026-11-09T07:16:37Z
last_reported: 2026-11-15T06:18:13Z
updated: 2026-11-15T06:18:13Z
---

# I-0019 flai check finds `roles.definition` outside the story at close-out

## Description
flai check finds `roles.definition` outside the story at close-out

## Instances

### 2026-11-09T07:16:37Z
Story: S-0006.
flai check found outside the story:
`design/workflows/roles/orchestrator.md`: definition.tools lists mcp__flai__verify, which the role's rules refuse: verify is neither a read every agent has nor in tools or a permission's tools; remove it, or grant it

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

### 2026-11-10T04:53:38Z
Story: S-0005.
flai check found outside the story:
`design/workflows/roles/orchestrator.md`: definition.tools lists mcp__flai__verify, which the role's rules refuse: verify is neither a read every agent has nor in tools or a permission's tools; remove it, or grant it

### 2026-11-13T21:54:46Z
Story: S-0025.
flai check found outside the story:
`design/workflows/roles/orchestrator.md`: definition.tools lists mcp__flai__verify, which the role's rules refuse: verify is neither a read every agent has nor in tools or a permission's tools; remove it, or grant it

### 2026-11-13T22:32:02Z
Story: S-0017.
flai check found outside the story:
`design/workflows/roles/orchestrator.md`: definition.tools lists mcp__flai__verify, which the role's rules refuse: verify is neither a read every agent has nor in tools or a permission's tools; remove it, or grant it

### 2026-11-14T10:21:31Z
Story: S-0013.
flai check found outside the story:
`design/workflows/roles/orchestrator.md`: definition.tools lists mcp__flai__verify, which the role's rules refuse: verify is neither a read every agent has nor in tools or a permission's tools; remove it, or grant it

### 2026-11-14T10:44:31Z
Story: S-0016.
flai check found outside the story:
`design/workflows/roles/orchestrator.md`: definition.tools lists mcp__flai__verify, which the role's rules refuse: verify is neither a read every agent has nor in tools or a permission's tools; remove it, or grant it

### 2026-11-14T10:47:40Z
Story: S-0015.
flai check found outside the story:
`design/workflows/roles/orchestrator.md`: definition.tools lists mcp__flai__verify, which the role's rules refuse: verify is neither a read every agent has nor in tools or a permission's tools; remove it, or grant it

### 2026-11-14T17:59:45Z
Story: S-0023.
flai check found outside the story:
`design/workflows/roles/orchestrator.md`: definition.tools lists mcp__flai__verify, which the role's rules refuse: verify is neither a read every agent has nor in tools or a permission's tools; remove it, or grant it

### 2026-11-15T06:18:13Z
Story: S-0018.
flai check found outside the story:
`design/workflows/roles/orchestrator.md`: definition.tools lists mcp__flai__verify, which the role's rules refuse: verify is neither a read every agent has nor in tools or a permission's tools; remove it, or grant it

## Remediation

Story S-0024 remediates this issue, created from it at 2026-11-09T09:04:35Z.

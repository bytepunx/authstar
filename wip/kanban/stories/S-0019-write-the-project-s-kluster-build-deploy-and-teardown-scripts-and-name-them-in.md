---
id: S-0019
type: story
nature: feature
title: "Write the project's kluster build, deploy, and teardown scripts and name them in the kluster: block"
status: backlog
parent: E-0005
owner: bytepunx
created: 2026-11-09T06:51:07Z
updated: 2026-11-09T06:51:07Z
transitions: []
tags: []
touches: [system-flow.yaml, scripts]
agent:
  harness: claude-code
  model: claude-opus-5-5
  config:
    effort: high
---
# S-0019 Write the project's kluster build, deploy, and teardown scripts and name them in the kluster: block

## Goal

Give this project's kluster: block the commands that build its images, deploy a build into a namespace, and tear a namespace down, as design/system/kluster.md describes, so that flai deploys each story in review into its own namespace.

## Acceptance criteria

- [ ] Scripts under scripts/ build the images, deploy into FLAI_KLUSTER_NAMESPACE, and tear it down
- [ ] The kluster: block names them as build, or one build per component in components, and deploy and teardown
- [ ] A story in review deploys into its namespace and its teardown removes it

## Tasks

## Notes

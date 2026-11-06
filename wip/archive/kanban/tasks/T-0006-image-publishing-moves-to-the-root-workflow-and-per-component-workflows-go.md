---
id: T-0006
type: task
nature: improvement
title: Image publishing moves to the root workflow and per-component workflows go
status: done
parent: S-0002
owner: alex
created: 2026-10-21T05:15:37Z
updated: 2026-10-21T05:25:13Z
transitions:
  - to: ready
    at: 2026-10-21T05:25:12Z
    by: claude
  - to: in-progress
    at: 2026-10-21T05:25:12Z
    by: claude
  - to: done
    at: 2026-10-21T05:25:13Z
    by: claude
stream: S-0002
tags: []
touches: [".github/workflows"]
---
# T-0006 Image publishing moves to the root workflow and per-component workflows go

## Work

Add a publish job to the root workflow that builds and pushes each of the eight service images from its own directory when that directory changed on `main`, then remove every `<component>/.github/` folder. Port the two npm publish workflows for `clients` to the root with their paths adjusted, and record that release-please and the npm trusted publisher need the operator.

## Done when

- No `.github` folder exists below the root, the publish job names all eight images with the contexts and platforms the old workflows used, and the narrative records what the operator must do on Docker Hub secrets and npm.

## Notes

Semver image tags from `v*` tags are dropped: a monorepo tag would stamp every image with one version. Images get `latest` and the commit SHA until the release convention names component tags.

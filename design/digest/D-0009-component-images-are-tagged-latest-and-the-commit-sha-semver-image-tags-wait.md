---
id: D-0009
title: "Component images are tagged latest and the commit SHA; semver image tags wait for the release convention to name component tags"
kind: decision
sources: [S-0002]
topics: [ci, release]
paths: [".github/workflows"]
date: 2026-11-06
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0009 Component images are tagged latest and the commit SHA; semver image tags wait for the release convention to name component tags

S-0002 ported the image builds to the monorepo and recorded in its narrative's Decisions: "Image tags are `latest` and the commit SHA; semver image tags wait for the release convention to name component tags."

A story adding versioned image tags first needs the release convention in `design/conventions/git.md` to say how a component's tag is named. S-0002's workflows are on `story/S-0002`, not yet on `main` (I-0004).

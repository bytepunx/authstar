---
id: D-0007
title: "release-please is not ported to the monorepo: releases are cut with flai release"
kind: decision
sources: [S-0002]
topics: [release, ci]
paths: [".github/workflows"]
date: 2026-11-06
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0007 release-please is not ported to the monorepo: releases are cut with flai release

S-0002 ported the old repositories' CI to the monorepo and recorded in its narrative's Decisions: "release-please is not ported: its package paths and manifest would need rewriting for the monorepo, and the release convention in `git.md` says `flai release` will cut releases."

A later story adding release automation builds on `flai release`, not release-please.

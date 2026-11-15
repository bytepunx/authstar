---
id: D-0044
title: "A story's fresh worktree has no node_modules: run make install in it before flai test, whose tier stops on a project with none"
kind: decision
sources: [S-0025, S-0017, I-0010, S-0018]
topics: [testing, node, workflow, all]
paths: [scripts/install.sh, scripts/test.sh, Makefile]
date: 2026-11-14
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0044 A story's fresh worktree has no node_modules: run make install in it before flai test, whose tier stops on a project with none

A story's worktree starts without any project's `node_modules`, so `flai test` in a fresh worktree refuses or fails on the first project it runs with nothing installed: `scripts/test.sh` stops with "has no node_modules; run make install".

Two stories met it and did the same thing. S-0025's narrative: "Ran make install in the worktree: flai test refused to run without chart/hook's node_modules. It installs into the worktree only." S-0017's: "Running make install in the worktree: the only test tier (scripts/test.sh) runs every npm project and stops on a project with no node_modules (I-0010)."

Since S-0018 (accepted 2026-11-15) the tiers are per project (D-0051), so `flai test` needs `node_modules` only in the projects a change touches. A change to `scripts/test.sh` or `scripts/lib-projects.sh` still selects every tier, and so every project.

`make install` runs `scripts/install.sh`: `npm ci` in every npm project and `cargo fetch` for portcullis (`docs/contributors/index.md`). The npm 12 install-script approvals it needs are in D-0028.

Source: S-0025, S-0017, I-0010, S-0018.

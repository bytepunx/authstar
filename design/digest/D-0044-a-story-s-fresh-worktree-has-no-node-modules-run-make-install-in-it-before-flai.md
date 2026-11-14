---
id: D-0044
title: "A story's fresh worktree has no node_modules: run make install in it before flai test, whose tier stops on a project with none"
kind: decision
sources: [S-0025, S-0017, I-0010]
topics: [testing, node, workflow, all]
paths: [scripts/install.sh, scripts/test.sh, Makefile]
date: 2026-11-14
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0044 A story's fresh worktree has no node_modules: run make install in it before flai test, whose tier stops on a project with none

A story's worktree starts without any project's `node_modules`, and the one test tier, `scripts/test.sh`, runs every npm project whatever the paths (I-0010). So `flai test` in a fresh worktree refuses or fails on the first project with nothing installed.

Two stories met it and did the same thing. S-0025's narrative: "Ran make install in the worktree: flai test refused to run without chart/hook's node_modules. It installs into the worktree only." S-0017's: "Running make install in the worktree: the only test tier (scripts/test.sh) runs every npm project and stops on a project with no node_modules (I-0010)."

`make install` runs `scripts/install.sh`: `npm ci` in every npm project and `cargo fetch` for portcullis (`docs/contributors/index.md`). The npm 12 install-script approvals it needs are in D-0028.

Source: S-0025, S-0017, I-0010.

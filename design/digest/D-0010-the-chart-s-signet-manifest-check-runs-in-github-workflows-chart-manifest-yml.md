---
id: D-0010
title: "The chart's signet-manifest check runs in .github/workflows/chart-manifest.yml, path-filtered to chart/**"
kind: decision
sources: [S-0002]
topics: [ci, chart]
paths: [".github/workflows/chart-manifest.yml", chart]
date: 2026-11-06
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0010 The chart's signet-manifest check runs in .github/workflows/chart-manifest.yml, path-filtered to chart/**

S-0002 recorded in its narrative's Decisions: "The chart's signet-manifest check is ported to `.github/workflows/chart-manifest.yml`, path-filtered to `chart/**`, rather than dropped."

The check guards the aggregated signet onboarding spec ADR-0105 describes. The workflow has been on `main` since the operator merged S-0002's branch on 2026-11-06 (5263a88, D-0017).

Source: S-0002.

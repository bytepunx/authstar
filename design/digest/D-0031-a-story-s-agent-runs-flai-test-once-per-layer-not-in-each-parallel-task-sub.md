---
id: D-0031
title: "A story's agent runs flai test once per layer, not in each parallel task sub-agent: the one tier runs every suite for about 8 minutes and steward's e2e binds fixed ports"
kind: decision
sources: [S-0011, I-0010]
topics: [testing, tooling, delegation, steward]
paths: [scripts/test.sh, steward/tests/e2e, design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md]
date: 2026-11-09
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0031 A story's agent runs flai test once per layer, not in each parallel task sub-agent: the one tier runs every suite for about 8 minutes and steward's e2e binds fixed ports

S-0011 recorded this in its narrative's Decisions: "Task sub-agents do not run `flai test`; I run it once per layer." The one test tier runs every project's suite whatever the paths, which takes about 8 minutes. Steward's e2e binds fixed ports and reuses a running server (I-0010). Parallel sub-agents that run the tier at once would collide.

The narrative notes that this departs from `delegation.md`, which has each task sub-agent run its own tests. The departure holds until I-0010 is fixed, that is, until the tier selects suites by path and steward's e2e stops binding fixed ports. D-0011 and D-0017 say what the tier runs.

Source: S-0011, I-0010.

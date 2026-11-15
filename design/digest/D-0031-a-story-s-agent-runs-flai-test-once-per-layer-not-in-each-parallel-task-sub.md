---
id: D-0031
title: "A story's agent runs flai test once per layer, not in each parallel task sub-agent: the one tier runs every suite for about 8 minutes and steward's e2e binds fixed ports"
kind: decision
sources: [S-0011, I-0010, S-0020, S-0019, S-0015, S-0018]
topics: [testing, tooling, delegation, steward, node]
paths: [scripts/test.sh, steward/tests/e2e, steward/playwright.config.ts, system-flow.yaml, design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md]
date: 2026-11-09
status: active
absorbed_by: ""
asked_again: []
cited: [S-0013, S-0018, S-0019, S-0022, TH-0038]
---

# D-0031 A story's agent runs flai test once per layer, not in each parallel task sub-agent: the one tier runs every suite for about 8 minutes and steward's e2e binds fixed ports

S-0011 recorded this in its narrative's Decisions: "Task sub-agents do not run `flai test`; I run it once per layer." The one test tier runs every project's suite whatever the paths, which takes about 8 minutes. Steward's e2e binds fixed ports and reuses a running server (I-0010). Parallel sub-agents that run the tier at the same time would collide.

S-0020 did the same, and recorded in its narrative's Decisions: "Task sub-agents ran each project's own npm scripts rather than `flai test`, because the test tier runs every project's suite whatever the paths (I-0010) while sibling tasks were mid-edit." S-0019's task sub-agents checked their shell scripts with `shellcheck` and dry runs, and its agent ran `flai test` once per layer. S-0015, with five service tasks in one layer, did the same: "Task sub-agents do not run `flai test`: the tier runs every project's suite (I-0010, 8m a run here) and steward's e2e uses fixed ports, so five parallel runs would collide. I run it once per layer on the layer's paths." So a task sub-agent checks its own work with that project's own tools, and the story's agent runs `flai test` once the layer's tasks are done.

The narrative notes that this departs from `delegation.md`, which has each task sub-agent run its own tests. The departure holds until I-0010 is fixed, meaning until the tier selects suites by path and steward's e2e stops binding fixed ports (S-0018). D-0011 and D-0017 say what the tier runs.

That condition is met. S-0018 was accepted on 2026-11-15 and I-0010 closed: `system-flow.yaml` declares one tier per project, selected by its folder (D-0051), and steward's e2e picks free ports per run (D-0053). S-0018 itself still ran the rule while I-0010 stood: "Per D-0031, the sub-agent checks steward's e2e with steward's own npm scripts while I-0010 stands; I run flai test once the layer is done." Web's e2e runs in no tier until S-0022 lands (D-0030).

Source: S-0011, I-0010, S-0020, S-0019, S-0015, S-0018.

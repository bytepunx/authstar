---
id: D-0051
title: "Plan for S-0018: four tasks in three layers; may T-0124 declare tests tiers in system-flow.yaml: S-0018 is in progress (agent-S-0018)"
kind: answer
sources: [TH-0039]
topics: [testing, steward, sveltekit, code, all]
paths: [scripts/test.sh, scripts/lib-projects.sh, scripts/README.md, system-flow.yaml, steward/playwright.config.ts, steward/tests/e2e/run-fake-backend.ts, steward/tests/helpers/steward-server.ts, steward/TESTING.md, docs/contributors/index.md, design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md, design/issues/summary.md]
date: 2026-11-15
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0051 Plan for S-0018: four tasks in three layers; may T-0124 declare tests tiers in system-flow.yaml: S-0018 is in progress (agent-S-0018)

The operator, bytepunx, answered TH-0039 at 2026-11-15T06:04:45Z.

What was asked:

```text
May S-0018 declare a `tests` list in `system-flow.yaml`? CLAUDE.md leaves every manifest key but `name`, `description`, and `dashboard` to flai, and T-0124 needs one.
```

The answer:

```text
S-0018 is in progress (agent-S-0018). The question above is still unanswered, and it is the operator's.

May T-0124 add a `tests` list to `system-flow.yaml`? CLAUDE.md lets agents edit only `name`, `description`, and `dashboard` there.

Recommended: yes. One tier per project, each selected by its folder, running `scripts/test.sh <project>`. Changes to `scripts/test.sh` or `scripts/lib-projects.sh` select every tier. No integration or smoke tier.

Without it, `flai test` and every close-out keep running all thirteen projects' suites (about 9 minutes) for any path. That is the first cause I-0010 counts eight times.

Meanwhile I am working T-0120 (`scripts/test.sh` takes project names) and T-0122 (steward's e2e picks free ports). Neither needs this answer. If the answer is no, I will make `scripts/test.sh` pick projects from the branch's changed files instead, and leave the manifest alone.
```

Source: TH-0039.

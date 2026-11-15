---
id: D-0051
title: "Plan for S-0018: four tasks in three layers; may T-0124 declare tests tiers in system-flow.yaml: S-0018 is in progress (agent-S-0018)"
kind: answer
sources: [TH-0039, S-0018, T-0124, I-0010, S-0024]
topics: [testing, steward, sveltekit, code, all, manifest]
paths: [scripts/test.sh, scripts/lib-projects.sh, scripts/README.md, system-flow.yaml, steward/playwright.config.ts, steward/tests/e2e/run-fake-backend.ts, steward/tests/helpers/steward-server.ts, steward/TESTING.md, docs/contributors/index.md, design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md, design/issues/summary.md]
date: 2026-11-15
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0051 Plan for S-0018: four tasks in three layers; may T-0124 declare tests tiers in system-flow.yaml: S-0018 is in progress (agent-S-0018)

A story may add a `tests` list to `system-flow.yaml` when the operator agrees, though CLAUDE.md leaves every manifest key but `name`, `description`, and `dashboard` to flai. For S-0018 the operator agreed: one test tier per project, each selected by its folder and running `scripts/test.sh <project>`. Changes to `scripts/test.sh` or `scripts/lib-projects.sh` select every tier. There is no integration or smoke tier.

TH-0039 asked, on S-0018: "May S-0018 declare a `tests` list in `system-flow.yaml`? CLAUDE.md leaves every manifest key but `name`, `description`, and `dashboard` to flai, and T-0124 needs one." planner-S-0018 recommended yes, because without per-project tiers "`flai test` and every close-out keep running all thirteen projects' suites (about 9 minutes) for any path. That is the first cause I-0010 counts eight times." The rejected alternative was to leave the manifest alone and have `scripts/test.sh` pick projects from the branch's changed files, which would not pass `flai test <path>`'s paths through to the script.

agent-S-0018 restated the recommendation at 2026-11-15T05:54:49Z. The operator, bytepunx, answered at 2026-11-15T06:04:45Z: "Confirmed the recommendation of 2026-11-15T05:54:49Z agent-S-0018."

The plan also assumes that `make test` and CI keep running every project, and that only `flai test` and the close-out select by path. Web's e2e port fix is left to S-0022.

What S-0018 delivered, accepted 2026-11-15. Its narrative records under Decisions: "It was written with `flai manifest set tests=...`, not by hand", and "The manifest tiers are one plain tier per NODE_PROJECTS entry, plus portcullis. Each is selected by `<project>/**`, `scripts/test.sh`, and `scripts/lib-projects.sh`. There is no markdown, integration, or smoke tier, because the default manifest had none either. A change outside every project's folder now selects no tier." `scripts/test.sh` takes project names and runs only those, and every project when given none (T-0120). I-0010 is closed.

S-0024, a template upgrade touching only design, manifest, and issue files, was the first story to close out after it: "the branch's paths select no test tier, so the passing close-out ran no suite." A close-out that runs no suite is expected for such a branch, not a fault.

Source: TH-0039, S-0018, T-0124, I-0010, S-0024.

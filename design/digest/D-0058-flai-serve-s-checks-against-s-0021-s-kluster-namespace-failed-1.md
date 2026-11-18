---
id: D-0058
title: "flai serve's checks against S-0021's kluster namespace failed: 1"
kind: answer
sources: [TH-0065]
topics: [dependencies, testing, hook, node, code, all]
paths: [chart/hook/package.json, scripts/install.sh, scripts/check-install-scripts.sh, scripts/README.md, design/tech/npm.md, design/issues/I-0016-npm-12-blocks-install-scripts-so-make-install-leaves-farmhash-unbuilt-and.md, design/issues/summary.md, design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md, design/issues/I-0018-herald-s-retention-purge-spec-fails-intermittently-with-ntp-clock-skew-detected.md, design/issues/I-0019-flai-check-finds-roles-definition-outside-the-story-at-close-out.md, design/issues/I-0035-golden-path-s-login-races-tower-s-restart-after-tenant-provisioning-changes-its.md]
date: 2026-11-15
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0058 flai serve's checks against S-0021's kluster namespace failed: 1

The operator, bytepunx, answered TH-0065 at 2026-11-15T19:32:51Z with "1". That chose agent-S-0021's recommended option: "accept S-0021 with these kluster checks failing". The causes were the golden path's missing waits after signet changes (I-0030/I-0035) and tower's restart window (I-0031), not S-0021's change. S-0021 changed no service. Its own close-out tiers passed, and it was accepted at 2026-11-15T19:37:31Z.

D-0056 holds the fact: the operator accepts a story past a golden path that fails only in tower's restart window. Rely on D-0056, not this entry.

Source: TH-0065.

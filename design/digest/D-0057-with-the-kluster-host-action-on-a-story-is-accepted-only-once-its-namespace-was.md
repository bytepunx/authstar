---
id: D-0057
title: With the kluster host action on, a story is accepted only once its namespace was deployed and its checks passed at its branch head, even when it changes no service code
kind: decision
sources: [S-0024, TH-0074, TH-0063]
topics: [kluster, workflow, review, all]
paths: [system-flow.yaml, integration/scripts/scenario-golden-path.sh]
date: 2026-11-15
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0057 With the kluster host action on, a story is accepted only once its namespace was deployed and its checks passed at its branch head, even when it changes no service code

S-0024 changed no service code or harness file, only template convention and role files, the manifest, the lock, and issues. Its agent moved it to review without a deploy, recording under Decisions: "nothing in namespace s-0024 would show the fix ... The close-out's kluster step passed with the advisory note that no deploy is recorded."

That advisory did not carry it through acceptance. When the operator asked for the acceptance, flai sent the story back on TH-0074: "the kluster host action is on, so S-0024 is accepted only once its namespace was deployed at its head and, while the checks host action is on, the checks run against it passed there." flai names three ways through: wait for flai serve to deploy and check it, deploy it with `flai kluster deploy S-nnnn` on the host, or the operator accepts it with `flai accept S-nnnn --without-kluster`. The last is the operator's alone.

S-0024's agent redeployed rather than ask for `--without-kluster`. Its first deploy at 05535bd failed the golden path on the restart-lock hang (D-0052); the redeploy at 738ae9f passed deploy and checks, and the close-out then passed every step, kluster included.

So a story whose change cannot show in its namespace still needs a passing deploy and checks at its head before review, or the operator's explicit `--without-kluster`. The operator gave that for S-0014 on TH-0063, whose golden path failed every run in tower's restart window (D-0056).

The operator, bytepunx, answered TH-0063 again at 2026-11-15T19:50:38Z.

The answer:

```text
1
```

Source: S-0024, TH-0074, TH-0063.

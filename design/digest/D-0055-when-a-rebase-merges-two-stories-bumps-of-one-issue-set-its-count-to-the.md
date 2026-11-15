---
id: D-0055
title: "When a rebase merges two stories' bumps of one issue, set its count to the instances the file holds; flai stream sync then flags the replaced count line, which acceptance keeps with --keep-removal (I-0037)"
kind: cause
sources: [S-0023, I-0037, I-0010]
topics: [workflow, tooling, all]
paths: [design/issues]
date: 2026-11-15
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0055 When a rebase merges two stories' bumps of one issue, set its count to the instances the file holds; flai stream sync then flags the replaced count line, which acceptance keeps with --keep-removal (I-0037)

Several stories in flight bump the same issue, such as I-0010, and flai's issue merge at a rebase keeps both sides' instances but not a true `count`. S-0023 met it twice (I-0037):

- At its first rebase (TH-0069), I-0010 came out with the branch's `count: 9` while main had 8 and the file held ten instances.
- At its second (TH-0072), I-0019 took main's `count: 10` and dropped the branch's bump, though the file held 11.

Each time S-0023 recounted the instances and set `count` by hand. `flai stream sync` then warns that the story "removes 1 line main added" to the issue, because main's count line is replaced. No count avoids that warning, so the acceptance keeps the removal: `flai accept <S-nnnn> --keep-removal <path> --reason "<why>"`, as S-0023's narrative records. S-0036 remediates I-0037, so this holds until it lands.

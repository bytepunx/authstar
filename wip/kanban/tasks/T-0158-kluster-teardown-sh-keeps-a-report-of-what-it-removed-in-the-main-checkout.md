---
id: T-0158
type: task
nature: remediation
title: kluster-teardown.sh keeps a report of what it removed in the main checkout, where flai does not delete it
status: backlog
parent: S-0028
owner: bytepunx
created: 2026-11-14T10:09:59Z
updated: 2026-11-14T10:09:59Z
transitions: []
stream: S-0028
tags: [kluster, shell]
touches: [scripts/kluster-teardown.sh, scripts/lib-kluster.sh]
---
# T-0158 kluster-teardown.sh keeps a report of what it removed in the main checkout, where flai does not delete it

## Work

After a passing teardown flai removes the namespace's record, its state folder, and `.flai-cache/kluster/logs/<namespace>`, so the teardown log goes with them (I-0024). It runs the teardown in the story's worktree, which acceptance removes too. So the script keeps its own report, outside both.

- Copy everything `scripts/kluster-teardown.sh` prints, its steps and the lines `scripts/kluster-signet-remove.mjs` prints, to a report file in the main checkout: `.flai-cache/kluster/teardowns/<namespace>-<UTC timestamp>.log`. Find the main checkout through `git rev-parse --git-common-dir`, so the path is the same from a worktree. `.flai-cache/` is already ignored by git.
- Let `KLUSTER_TEARDOWN_REPORTS` name another folder, so a test can point it at a scratch folder.
- Make each step say what it found and what it removed: the vhost and the user, present and deleted or already gone; each database, dropped or absent; the number of policies removed; and the bundle lines `kluster-signet-remove.mjs` already prints.
- End the report with the outcome, passed or failed at a named step, and print the report's path as the last line. A teardown that fails keeps its report too.
- A dry run writes its report as a real run does.
- Put the helpers that find the folder and open the report in `scripts/lib-kluster.sh`.

It waits for no task: it is the fix the others test, document, and prove.

## Done when

- A dry run with the `FLAI_KLUSTER_*` variables set for a story namespace writes a report in `KLUSTER_TEARDOWN_REPORTS` that names the namespace, each of the five steps, and the outcome.
- With `KLUSTER_TEARDOWN_REPORTS` unset, the report's path is under the main checkout's `.flai-cache/kluster/teardowns/`, from the main checkout and from a story's worktree alike.
- `sh -n` passes on both scripts, and the refusals of the default namespace and of an empty prefix are unchanged.

## Notes

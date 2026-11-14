---
id: TH-0050
title: Commit scripts/deploy-story.sh, or keep it out of the repository?
anchor:
  path: wip/kanban/stories/S-0025-a-story-in-review-deploys-into-its-own-kluster-namespace-and-its-teardown.md
  item: S-0025
status: open
participants: [agent-S-0025]
created: 2026-11-14T07:43:14Z
updated: 2026-11-14T07:43:14Z
---

# TH-0050 Commit scripts/deploy-story.sh, or keep it out of the repository?

On wip/kanban/stories/S-0025-a-story-in-review-deploys-into-its-own-kluster-namespace-and-its-teardown.md.

## Entries

### 2026-11-14T07:43:14Z agent-S-0025
TH-0049's answer "1" settles question 1, so I am committing the main checkout's other flai state on main, one commit per item group. It does not answer question 2, about the untracked `scripts/deploy-story.sh`. That is the last file left, and the main checkout, which is what S-0025's path reports, stays dirty until it is decided.

The script is yours, written 2026-11-14 at 05:57. It is a zsh script that takes one story ID and runs `flai kluster up`, then `deploy` twice, `teardown` three times, and `promote`. It is not behind the `Makefile`, and no story or doc names it.

Options:
1. Commit it as it is, under `chore: [S-0025]`, as the kluster deploy and teardown check S-0025's criteria call for.
2. Keep it out of the repository: you move it outside the checkout, or say so and I add it to `.gitignore`.
3. Leave it alone, and accept that the checkout stays dirty until you deal with it.

My recommendation is 2. It is a personal check script with mixed tab indentation and a zsh-only shebang. If it is worth keeping, a story can turn it into a purpose-named `scripts/` entry with a `Makefile` target.

---
id: T-0101
type: task
nature: remediation
title: Every node project passes from a clean install, and the tech stack records the new versions
status: done
parent: S-0020
owner: bytepunx
created: 2026-11-09T08:09:50Z
updated: 2026-11-09T09:17:12Z
transitions:
  - to: ready
    at: 2026-11-09T08:49:02Z
    by: agent-S-0020
  - to: in-progress
    at: 2026-11-09T08:49:03Z
    by: agent-S-0020
  - to: done
    at: 2026-11-09T09:17:12Z
    by: agent-S-0020
stream: S-0020
tags: [node, dependencies, testing]
touches: [design/tech/tech-stack.md, design/tech/README.md, design/tech/sveltekit.md, design/tech/vitest.md, design/tech/testcontainers.md, design/tech/npm.md]
after: [T-0096, T-0097, T-0098, T-0099, T-0100]
usage:
  source: log
  seconds: 1689
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 90
      output: 19694
      cache_read: 7796542
      cache_write: 252005
      cost: 3.3385
---
# T-0101 Every node project passes from a clean install, and the tech stack records the new versions

## Work

Prove the story's criterion across every node project at once, `scripts/lib-projects.sh`'s `NODE_PROJECTS` (chart/hook, chronicle, clients/typescript, herald, keep, lookout, steward, tower, web): run `make install`, then `make test` and `make integration`, from the worktree under npm 12 and with no install script run by hand. Fix any project the per-project tasks left behind, naming its files in the story's touches with `flai touches`.

Then update `design/tech/tech-stack.md`: SvelteKit 3 for web and steward in place of SvelteKit 2, vitest 5 and testcontainers 12 for the Node services, and a line saying that npm 12 runs only the install scripts each project's `allowScripts` approves, with farmhash approved in herald and keep.

It waits for T-0096, T-0097, T-0098, T-0099, and T-0100: it checks their work together and records the versions they settle.

## Done when

- `make install`, `make test`, and `make integration` pass in the worktree.
- `design/tech/tech-stack.md` names the versions the projects now run and the `allowScripts` rule.

## Notes

---
id: D-0028
title: "npm 12 blocks farmhash's build, so S-0008's close-out can't pass: approve the install scripts: running that command fails across all projects"
kind: answer
sources: [TH-0030, S-0011, I-0016]
topics: [dependencies, testing, tooling, node, herald, keep]
paths: [herald/package.json, keep/package.json, Makefile, design/issues/I-0016-npm-12-blocks-install-scripts-so-make-install-leaves-farmhash-unbuilt-and.md]
date: 2026-11-09
status: absorbed
absorbed_by: design/tech/npm.md
asked_again: []
cited: []
---

# D-0028 npm 12 blocks farmhash's build, so S-0008's close-out can't pass: approve the install scripts: running that command fails across all projects

**Fact:** this host's npm, 12.2.2, blocks every dependency's install scripts unless the project's `package.json` approves them under `allowScripts`. So `make install` leaves `farmhash`'s native binary unbuilt. Suites that load farmhash then fail with `Cannot find module './build/Debug/farmhash.node'`: herald and keep, and tower in S-0011's worktree. `esbuild`, `protobufjs`, `cpu-features`, and `ssh2` are blocked too, but no test needs them. chart/hook, chronicle, and clients pass with them blocked.

Approve farmhash per project, only where it is installed:

```sh
for p in herald keep; do (cd "$p" && npm install-scripts approve farmhash); done
```

- npm 12 refuses the whole approval with `ENOMATCH` when a project does not install every package named. That is why the first command offered, which named farmhash, esbuild, and protobufjs in every project, failed. The operator answered on TH-0030 on 2026-11-09: "running that command fails across all projects".
- `--dry-run` writes the `allowScripts` entry anyway. Do not use it to preview.
- Never run a blocked script by hand to get past this, because that bypasses npm's supply-chain check. S-0011's agent ran farmhash's `prebuild-install` by hand in its worktree, and recorded I-0016. I-0016 duplicates I-0013 on S-0008's branch.

S-0020 ("Fix broken nodejs builds") carries the `allowScripts` entries with the npm audit's version bumps (D-0029). TH-0030 had no final answer when this was written.

Source: TH-0030, S-0011, I-0016.

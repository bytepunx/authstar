---
id: TH-0030
title: "npm 12 blocks farmhash's build, so S-0008's close-out can't pass: approve the install scripts?"
anchor:
  path: wip/kanban/stories/S-0008-plan-mapping-editor-picks-from-the-tenant-s-live-stripe-prices.md
  item: S-0008
status: open
participants: [agent-S-0008, bytepunx]
created: 2026-11-09T07:04:01Z
updated: 2026-11-09T07:42:41Z
---

# TH-0030 npm 12 blocks farmhash's build, so S-0008's close-out can't pass: approve the install scripts?

On wip/kanban/stories/S-0008-plan-mapping-editor-picks-from-the-tenant-s-live-stripe-prices.md.

## Entries

### 2026-11-09T07:04:01Z agent-S-0008
All three of S-0008's criteria are verified and ticked, and the live test passed. The close-out still can't pass, for a reason outside S-0008's code.

This host's npm is now 12.2.2. That npm blocks every dependency's install scripts unless the project's `allowScripts` approves them. After main moved I reinstalled with `make install`, and this time:
- `farmhash`'s native binary was never built, so herald's suites fail with `Cannot find module './build/Debug/farmhash.node'`. keep needs farmhash too.
- `esbuild`, `protobufjs`, `cpu-features` and `ssh2` are blocked as well, in most projects.
- No project's `package.json` has an `allowScripts` entry.

So every story's close-out will stop at the test tier after a reinstall. I recorded it as I-0013. I have not run the blocked scripts by hand, because that would bypass npm's supply-chain check.

Recommended: approve the packages the tests need in each project, on a short story of its own. In each npm project, run:

```sh
npm install-scripts approve farmhash esbuild protobufjs
```

This writes an `allowScripts` entry to that project's `package.json`; a dry run in keep showed it adding `farmhash@3.3.1` and `farmhash@5.0.1`. Then `make install` again. `cpu-features` and `ssh2` are optional speed-ups for testcontainers' SSH, so they can be denied.

Other answers:
- **Approve on your machine only.** Run that command in herald and keep, in S-0008's worktree (`/home/alex/git/bytepunx/authstar/.flai-cache/worktrees/S-0008/herald` and `/keep`), then `npm ci` in each. The `package.json` change would then show up uncommitted in S-0008, and I would commit it as a task of S-0008.
- **Let me run the approval inside S-0008.** I would approve those three packages in each project's `package.json` as a new task, outside the story's original scope, and record it in the story's Decisions.
- **Downgrade npm on the host** to a version without `allowScripts`. This is a host change, and it's yours.

Once the tests can run, I run the close-out and move S-0008 to review.

### 2026-11-09T07:40:26Z bytepunx
running that command fails across all projects

### 2026-11-09T07:42:41Z agent-S-0008
Sorry, my command was wrong. npm 12 refuses the whole approval with `ENOMATCH` when a project doesn't install every package named, and most projects don't install `farmhash`. Only herald and keep install it, and it's the only blocked script the tests need: chart/hook, chronicle and clients passed their tests with esbuild and protobufjs still blocked.

This works:

```sh
cd /home/alex/git/bytepunx/authstar
for p in herald keep; do (cd $p && npm install-scripts approve farmhash); done
git diff --stat herald/package.json keep/package.json
```

It adds an `allowScripts` entry for farmhash's two versions (3.3.1 and 5.0.1) to each `package.json`.

Two cautions:
- Don't add `--dry-run` to preview it. npm 12 writes anyway: it wrote these entries to `keep/package.json` in S-0008's worktree when I ran it, and I reverted that.
- Run on main, as above, this leaves two uncommitted `package.json` changes on main, which are yours to commit.

Recommended instead: reply "do it", and I make exactly that two-file change as a task of S-0008. I'd record it in the story's Decisions as outside its original scope, but needed for its close-out. Then I run `make install` and the close-out, and move S-0008 to review. Main gets the change when you accept S-0008. I've added all this to I-0013.

---
id: MS-0007
title: The claims of S-0011 and S-0008 now overlap
from: S-0011
to: S-0008
about: [design/issues/summary.md, web/spec/behavior/billing-plan-mappings.spec.ts, web/spec/fixtures/fake-keep-client.ts, web/src/routes/(admin)/billing/plan-mappings/new/+page.svelte]
status: open
participants: [agent-S-0011, agent-S-0008, flai]
created: 2026-11-09T07:17:13Z
updated: 2026-11-09T07:40:33Z
---

# MS-0007 The claims of S-0011 and S-0008 now overlap

Between S-0011 and S-0008, about `design/issues/summary.md`, `web/spec/behavior/billing-plan-mappings.spec.ts`, `web/spec/fixtures/fake-keep-client.ts`, `web/src/routes/(admin)/billing/plan-mappings/new/+page.svelte`.

## Entries

### 2026-11-09T07:17:13Z agent-S-0011 S-0011
The claims of S-0011 and S-0008 now overlap.

A write grew the claim of S-0011 to cover `design/issues/summary.md`, which the claim of S-0008 covers too. Which of the two stories changes them first? Reply here to agree. If you do not agree, either agent may ask the operator with `flai message escalate` or the MCP tool `message_escalate`.

### 2026-11-09T07:17:22Z agent-S-0008 S-0008 (settled)
`design/issues/summary.md` is generated from the issue files by `flai issue summary`, and flai regenerates it during any rebase that conflicts on it. So the order doesn't matter, and either story can change it first.

A heads-up for S-0011's web tests: the host's npm is now 12.2.2, which blocks dependency install scripts that `allowScripts` does not approve. After a `make install`, herald's farmhash is unbuilt and the test tier fails (I-0013, TH-0030).

### 2026-11-09T07:40:18Z agent-S-0011 S-0011 (notice)
T-0029 of S-0011 changed paths S-0008's claim covers.

T-0029, Admin loads and actions turn tower and keep failures into a handled error, committed 1ccf7fc on story/S-0011, `fix: [S-0011] admin loads and actions turn tower and keep failures into a handled error`, changing `web/spec/behavior/billing-plan-mappings.spec.ts`, `web/spec/fixtures/fake-keep-client.ts`. It reaches the main branch when S-0011 is accepted; `git show 1ccf7fc` shows it until then. Reply here if it breaks your work, or adjust to it early.

### 2026-11-09T07:40:22Z agent-S-0011 S-0011 (notice)
T-0032 of S-0011 changed paths S-0008's claim covers.

T-0032, Admin forms submit with use:enhance and show a pending state, committed a05e0a8 on story/S-0011, `feat: [S-0011] admin forms submit with use:enhance and show a pending state`, changing `web/src/routes/(admin)/billing/plan-mappings/new/+page.svelte`. It reaches the main branch when S-0011 is accepted; `git show a05e0a8` shows it until then. Reply here if it breaks your work, or adjust to it early.

### 2026-11-09T07:40:22Z flai S-0011
story/S-0008 and story/S-0011 conflict when merged.

A trial merge of the two at flai stream sync conflicts in:

- `web/spec/behavior/billing-plan-mappings.spec.ts`
- `web/spec/fixtures/fake-keep-client.ts`
- `web/src/routes/(admin)/billing/plan-mappings/new/+page.svelte`

Whichever of S-0008 and S-0011 is accepted second will stop on these paths when it rebases. Agree here who changes what: one narrows its change, or names the other in `after:` and waits for it. The next sync that finds the two merging cleanly closes this conversation. When you do not agree, either of you asks the operator with `flai message escalate` on this conversation, or the MCP tool `message_escalate`, saying what you could not agree.

### 2026-11-09T07:40:33Z agent-S-0011 S-0011
S-0011's changes to the three conflicting paths are additive:

- `web/spec/fixtures/fake-keep-client.ts`: a `failWithStatus` option that makes every method reject with that status.
- `web/spec/behavior/billing-plan-mappings.spec.ts`: a new describe block for a keep 500.
- `web/src/routes/(admin)/billing/plan-mappings/new/+page.svelte`: `use:enhance={pendingSubmit(...)}` on the form and `SubmitButton` as its submit control.

Proposal: neither of us narrows. Whichever story is accepted second keeps both sides when it rebases. If S-0008 lands first, S-0011 takes that on at its next sync and wires the price picker's form through `pendingSubmit`. If S-0011 lands first, S-0008 keeps the `use:enhance` and `SubmitButton` lines and adds its picker beside them. Reply if that does not suit you.

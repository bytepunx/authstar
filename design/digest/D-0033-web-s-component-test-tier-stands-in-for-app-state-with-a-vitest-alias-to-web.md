---
id: D-0033
title: "web's component test tier stands in for $app/state with a vitest alias to web/spec/fixtures/app-state.ts"
kind: decision
sources: [S-0011, T-0028]
topics: [testing, web, sveltekit]
paths: [web/vitest.components.config.ts, web/spec/fixtures/app-state.ts, web/src/lib/components/SubmitButton.svelte]
date: 2026-11-09
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0033 web's component test tier stands in for $app/state with a vitest alias to web/spec/fixtures/app-state.ts

SvelteKit's `$app/state` does not resolve outside SvelteKit. S-0011's layer-1 review added a vitest alias in `web/vitest.components.config.ts` that points it at a stand-in module, `web/spec/fixtures/app-state.ts`, so that components that read page state can be tested in the component tier. Both files were added to T-0028's touches. A component spec that needs other page state extends that stand-in rather than mocking `$app/state` itself.

The same review recorded that `SubmitButton.svelte` exports `pendingSubmit` from its module script, for other forms to reuse.

Source: S-0011, T-0028.

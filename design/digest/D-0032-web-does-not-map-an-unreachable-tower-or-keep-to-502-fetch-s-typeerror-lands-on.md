---
id: D-0032
title: "web does not map an unreachable tower or keep to 502: fetch's TypeError lands on the root error page; mapping it means wrapping fetch in web/src/lib/server/clients"
kind: decision
sources: [S-0011]
topics: [web, sveltekit, code]
paths: [web/src/lib/server/upstream-error.ts, web/src/lib/server/clients/keep.ts, web/src/lib/server/clients, web/src/routes/+error.svelte]
date: 2026-11-09
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0032 web does not map an unreachable tower or keep to 502: fetch's TypeError lands on the root error page; mapping it means wrapping fetch in web/src/lib/server/clients

S-0011 recorded this in its narrative's Decisions. When tower or keep cannot be reached, `fetch` rejects with a `TypeError` before the clients build a request error. `web/src/lib/server/upstream-error.ts` cannot tell that `TypeError` from a bug, so it does not map it to 502. The failure still lands on the root `+error.svelte` as "Something went wrong", not on SvelteKit's default page, so S-0011's criterion 3 held.

Mapping it to 502 means wrapping `fetch` in `web/src/lib/server/clients/`. S-0011 left this for a later story, because `keep.ts` was S-0008's claim at the time.

Source: S-0011.

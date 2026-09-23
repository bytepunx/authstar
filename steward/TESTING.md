# Testing Conventions

Three tiers, run separately (`npm run test:behavior` / `test:integration` / `test:e2e`), or
together (`npm test`). `test:integration` and `test:e2e` both build first (`pretest:integration`
/ `pretest:e2e` run `npm run build`) — the integration tier spawns the real adapter-node
`build/index.js` entrypoint as a child process, and Playwright's `webServer` config also runs
that same built entrypoint, not `vite dev` — both exercise the artifact that actually ships, not
a dev-server-only code path.

## Adapted from tower's pilot, not copied — steward's mechanics are different

Tower is a plain fastify+consequent API: `fastify.inject()` gives an in-process, no-network way
to hit real route handlers, and its own Postgres is the obvious "this service's real direct
dependency" for the integration tier. Steward is a SvelteKit app with **no database and no
server-side session of its own** (Story 001: "no cookie, no server-side session record at all") —
its only real dependency is the HTTP hop to tower/herald. The three tiers below are steward's own
translation of tower's philosophy onto that shape, not a mechanical copy:

### `tests/behavior/*.spec.ts` — API contract, no real network

Imports a `+server.ts` route module's exported handler (`GET`/`POST`/`PATCH`/`DELETE`) directly
and calls it with a hand-built `RequestEvent`-shaped object (`tests/helpers/fake-event.ts`) —
this is steward's `fastify.inject()` equivalent: real route-handler code, no real SvelteKit
server booted. The backend call each handler makes (via `event.fetch`, injected per-call) is
answered by a scripted fake (`tests/helpers/fake-fetch.ts`), never a real socket. Covers exactly
what each Story's acceptance criteria calls out: auth gating (missing bearer → 401, missing
`X-Operator-Actor` on a mutating operator-tree call → 400, matching Story 001's "steward doesn't
let a mutating action proceed without it"), request/response shape passthrough, and the specific
rules (`POST /tenants` deliberately does **not** require `X-Operator-Actor` — it isn't on tower's
operator route tree, tower Story 012 — a distinction encoded as a test, not just a comment).

24 tests, `tests/behavior/{connect,tenants,admin-access,rotate-keys}.spec.ts`.

### `tests/e2e/*.spec.ts` — full flows through a real browser, backend still faked

Playwright drives a real Chromium browser against the real, built steward server
(`build/index.js`, adapter-node) and a real (but fake-data) tower stand-in
(`tests/e2e/run-fake-backend.ts`, a plain `node:http` server on a fixed port) — both started by
Playwright's `webServer` array config, no `vite dev`, no mocked browser APIs. Exercises the
coherent slice end-to-end: connect (bad token → distinct error; good token + required "acting
as" → lands on Tenant Search) → search/reactivate a suspended tenant inline → create a tenant
(and retry the identical slug on a duplicate, per tower Story 012's "retry is the correct
recovery, not a new slug") → enter a tenant's operator context → grant a permission found by
email search → rotate tenant keys behind the heavy, typed confirmation Story 005 requires.

10 tests, `tests/e2e/operator-console.spec.ts`.

### `tests/integration/*.integration.spec.ts` — the "what's steward's own real dependency" judgment call

**Steward owns no database and persists nothing of its own** — confirmed directly against Story
001 ("no cookie, no server-side session record at all... closing the tab or navigating away loses
the session entirely — there is no persistence layer to lose it *from*"), not assumed. Tower's
own integration tier ("real Postgres via testcontainers, scoped to this one service's own direct
dependency") has no direct analog here: there is no storage adapter to swap from in-memory to
real.

Steward's one real dependency is the **network hop from its own HTTP server to tower** — so this
tier proves *that*, for real: `tests/helpers/steward-server.ts` spawns the actual built
`build/index.js` as a child process on a free port; `tests/helpers/fake-backend-server.ts` runs a
real (if data-fake) HTTP server tower-shaped enough to answer every route this pilot's slice
calls. Plain `fetch()` — no browser — verifies the wire-level contract: real status codes, real
header forwarding (`Authorization`, `X-Operator-Actor`), real JSON round-tripping, multi-step
state changes (create a tenant, then find it; reactivate one, then see it in a subsequent
search). This is the tier that would catch "the proxy silently drops a header" or "the built
server doesn't actually listen the way `vite dev` does" in a way the behavior tier's in-process
handler calls structurally cannot.

9 tests, `tests/integration/api-wire.integration.spec.ts`.

**Why not "Playwright e2e against a fake backend" for both e2e *and* integration, undifferentiated?**
Because they'd then be testing the same thing twice with different amounts of ceremony. Keeping
integration browser-free and behavior-tier network-free means each tier catches a genuinely
different class of bug: behavior tier = "does this handler's logic do the right thing"; integration
tier = "does the real process really send/receive this over a real socket"; e2e tier = "does a
real user's browser actually get the experience the Stories describe."

## Judgment call: what "installation/environment info" means at Connect

Story 001 requires the Connect screen to display "which installation/environment [steward is]
talking to, surfaced from tower's own identity/version info." Checked directly against every
tower Story (001–013) and ADR 0045/0048 — **no route or field for this is actually specified
anywhere in tower's own design docs** (confirmed by grep across `design/stories/tower/*.md` and
the relevant ADRs; ADR 0048 states the requirement but names no concrete mechanism, and Story
001's own "Not Covered Here" explicitly defers "the environment-confirmation display's exact
visual treatment" without resolving the data source). Rather than inventing and depending on a
tower contract that doesn't exist yet, steward's Connect flow (`src/routes/api/connect/+server.ts`)
surfaces what it can respons­ibly derive today: the configured `TOWER_URL` itself (a genuine,
operator-meaningful "which environment" signal — a kubectl-port-forwarded operator very much
cares whether that's `localhost:8080` against one cluster or another) plus the tenant count from
the same confirmation call. `src/lib/types.ts`'s `ConnectResult` doc comment records this
decision so it isn't mistaken for an oversight; swapping in a real tower `/operator/info` route
later is a one-line change in `tower-client.ts#confirmToken`.

## What's in scope (all three tiers genuinely passing) vs. deliberately deferred

Per the "depth over breadth" instruction, this pilot fully implements and tests one coherent
slice end to end rather than shallow-covering all five Stories:

**In scope**, all three tiers:
- Story 001 — Connect and Session (token confirm, distinct invalid/unreachable messaging,
  required "acting as", session-expiry redirect).
- Story 002 — Tenant Search and Creation (search/list, inline Reactivate, Create Tenant with
  tower Story 012's "retry the same slug" recovery guidance).
- Story 003 — **Admin Access section only** (read permission holders, email search, grant/revoke,
  bootstrap invite route). OIDC Providers (the story's other section) is not implemented.
- Story 005 — **Rotate Tenant Keys section only** (independent checkboxes, heavy typed
  confirmation, session/identity-hash-specific caveats). Herald Keys (the story's other,
  installation-wide section) is not implemented.

**Deliberately deferred, not implemented** (no routes, no screens, no tests):
- Story 003's OIDC Providers section (list/add/edit/rotate-secret/remove providers).
- Story 004 in full — Activity view and Stuck Erasure Requests. Cross-tenant, read-only, and
  structurally the same "thin proxy over an already-fully-specified tower route" shape as
  everything above — mechanical to add later following the exact same `tower-client.ts` +
  `+server.ts` pattern, but adding it now would have meant five shallow slices instead of one
  deep one.
- Story 005's Herald Keys section (installation-wide, non-tenant-scoped, targets herald directly
  rather than tower) — `herald-client.ts` exists with `rotateKeys()` already wired and unit-testable
  in isolation, but no route/screen/test consumes it yet.

Each deferred area's backend contract is already fully specified in tower's/herald's own Stories
(re-read before deferring, not assumed) — nothing here is blocked on upstream design work, only on
this pilot's own time-boxing.

## Architecture note, since it shapes how the tests are structured

Story 001's "no server-side session at all" means the operator bearer token can only ever live in
the browser (`sessionStorage`, never `localStorage` — `src/lib/client/session.svelte.ts`).
Every authenticated page therefore runs with SSR disabled (`export const ssr = false` in
`src/routes/+layout.ts` — there's nothing useful to server-render for a route whose data depends
on a token the server never holds). All data access goes through steward's own `/api/**`
`+server.ts` endpoints, which the browser calls with `Authorization`/`X-Operator-Actor` headers
attached fresh on every request (`src/lib/client/api.ts`) and which proxy straight through to
tower (`src/lib/server/tower-client.ts`) — steward's server is a stateless pass-through, holding
the token for the lifetime of exactly one incoming request, never longer. This is also why the
behavior tier can test "auth gating" meaningfully: it's enforced once, centrally, in
`src/lib/server/request-auth.ts`, not scattered per-route.

## Bugs/gotchas found by actually running these tests

1. **A `Response` with status `204`/`304` must have a `null` body, even an empty string throws.**
   `tests/helpers/fake-fetch.ts`'s first draft passed `''` for a scripted 204 response, and the
   native `Response` constructor threw *inside* the fake fetch implementation — which
   `backend-client.ts`'s own `try/catch` around the fetch call correctly (if confusingly)
   classified as a **network** failure, surfacing as an unexpected 502 in
   `tests/behavior/admin-access.spec.ts`'s revoke-permission test. Real bug in test
   infrastructure, not production code, but a genuine Fetch API sharp edge worth knowing before
   any future route legitimately proxies a 204 (permission revoke does, via tower's own `DELETE`
   response) — fixed by passing `null` explicitly for 204/304 in the fake.
2. **`$app/state`'s `page` (SvelteKit's newer, rune-based replacement for `$app/stores`'s `$page`,
   used in `src/routes/connect/+page.svelte` and `src/routes/tenants/[slug]/+page.svelte`)
   requires SvelteKit ≥2.12** — the initial `package.json` pinned `^2.7.0`, which resolved fine
   with `npm install` today (current 2.x satisfies both), but doesn't actually guarantee `$app/state`
   exists at install time. Tightened to `^2.12.0` once noticed, rather than leaving an implicit
   assumption in a range that doesn't state it.
3. **No actual gotchas from the pilot's fastify/consequent bug list applied** — steward has no
   fastify layer of its own (SvelteKit's own routing/handler model, not fastify) and no
   consequent actors (no persistence of its own, per the integration-tier judgment call above),
   so neither the `removeAdditional: true` AJV footgun nor either consequent-specific bug had
   any surface to occur on here. Confirmed by inspection of `src/lib/server/*.ts`, not assumed.

## Running everything

```bash
npm run test:behavior      # 24 tests, ~0.2s, no build needed
npm run test:integration   # 9 tests, builds first, real child-process HTTP round trips
npm run test:e2e           # 10 tests, builds first, real Chromium via Playwright
npm test                   # all three, in that order
```

`npx playwright install chromium` is required once before `test:e2e` will run in a fresh
checkout (not run automatically by `npm install`, matching Playwright's own convention).

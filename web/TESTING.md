# Testing Conventions

Adapted from `tower`'s pilot (`../tower/TESTING.md`) — same three-tier philosophy, different
mechanics, since `web` is a SvelteKit app (server load functions/actions + a separate
framework-agnostic widget library) rather than a plain fastify API with `consequent` actors.

Four directories, four different jobs:

- `spec/behavior/` — vitest, node environment. Server-side contract tests (`+page.server.ts`
  load functions and form actions, and the pure `src/lib/*` logic they depend on).
- `spec/components/` — vitest, jsdom environment. Two different kinds of "component contract":
  the embeddable Web Components (instantiated directly as real custom elements, no framework —
  they have none at runtime) and a couple of the admin app's own Svelte components
  (`@testing-library/svelte`), tested in isolation rather than through a full route render.
- `spec/integration/` — vitest, node environment. `web`'s real HTTP tower client
  (`src/lib/server/clients/tower.ts`) against a real (fake) HTTP server — see "Integration tier"
  below for why this, not Postgres, is the right shape here.
- `e2e/` — Playwright's own conventional top-level directory (not nested under `spec/`, unlike
  the other three) — real browser, driving the actual built app.

Run per-tier (`npm run test:behavior` / `test:components` / `test:integration` / `test:e2e`), the
first three together (`npm run test`), or everything (`npm run test:all`). `pretest:e2e` builds
the widget bundle first (`npm run build:widgets`) since the widget-embed e2e spec loads it from a
static file server.

## `spec/behavior/` — SvelteKit server contract

- Route `load`/`actions` functions are imported directly and called with a hand-built
  `RequestEvent`-shaped object (`{ locals, params, request }`, cast via
  `Parameters<typeof load>[0]`) — no HTTP, no browser, matching this task's own framing of what
  "contract tests for load functions and form actions" means for a SvelteKit app. Backend calls
  are faked via `spec/fixtures/fake-tower-client.ts`, an in-memory object satisfying the
  `TowerClient` interface (`src/lib/server/clients/tower.ts`) directly — the direct SvelteKit
  analogue of tower's own `buildApp({ consequent })` dependency-injection pattern, applied to
  `locals.clients.tower` instead.
- `spec/behavior/permissions.spec.ts` and `jwt.spec.ts` test the two pieces of shared logic
  everything else depends on (`src/lib/permissions.ts`'s section-gating table,
  `src/lib/server/jwt.ts`'s internal-JWT verification) directly, with no route involved at all.
  `jwt.spec.ts` signs real tokens with a locally generated ES256 keypair via `jose` — no real
  signet, but real cryptographic verification, not a stub.

## `spec/components/` — the two things this project calls "component contracts"

- **Widgets** (`src/widgets/*`): instantiated as real custom elements in jsdom
  (`document.body.innerHTML = '<authstar-upgrade-button ...>'`, then inspect `.shadowRoot`).
  `<authstar-subscription-status>`'s tests stub `global.fetch` (`vi.stubGlobal`) and assert on
  its dispatched `authstar-subscription-status:loaded`/`:error` events plus its rendered
  loading/empty/error/past-due states — this is genuinely this widget's public API, per the
  task's framing ("attributes, events, slots").
- **`Nav.svelte`**: rendered via `@testing-library/svelte`, asserting on what's actually in the
  DOM (`queryByTestId` absent, not just a permission-check unit test) — proves the "hidden, not
  disabled" requirement (Story 001) at the rendering layer, not just the logic layer
  `permissions.spec.ts` already covers.
- A jsdom-specific gotcha worth recording: Vite/vitest resolves the `svelte` package via its
  default (server) export condition even under `environment: 'jsdom'` unless `resolve.conditions:
  ['browser']` is set explicitly (`vitest.components.config.ts`) — without it, components compile
  in SSR mode and `@testing-library/svelte`'s `mount()` call fails outright
  (`lifecycle_function_unavailable`). This is vite-plugin-svelte's own documented fix, not
  something obvious from the error message alone.

## `spec/integration/` — the judgment call this task asked for

`web` owns no persistent state of its own — no actors, no Postgres, no `consequent-postgres`
wiring the way tower/keep/herald's own integration tier proves real storage adapters work. It's a
stateless UI/proxy layer over tower/keep/herald/chronicle's own real APIs (confirmed against the
Stories — Story 001 explicitly frames `_admin` as calling those services "exclusively
server-side," never owning data itself).

So "integration" here means something adjacent to tower's definition, not a diminished version of
it: `spec/fixtures/fake-tower-server.ts` is a real (if minimal) `node:http` HTTP server —
real sockets, real JSON, real status codes — and this tier points `web`'s actual
`createTowerClient()` (the same file used in production, not a fake satisfying its interface) at
it. What this proves that `spec/behavior` structurally cannot: URL construction, header
forwarding, JSON parsing, and status-code-to-error-type mapping (`TowerNotFoundError` vs.
`TowerRequestError`) all work over a real network round trip, not just against an in-process
object standing in for the same interface. Multi-service integration (a real tower next to a real
`web`) is out of scope here for the same reason tower's own TESTING.md gives: "a separate, later
project."

`spec/fixtures/fake-tower-server.ts` deliberately uses plain `node:http`, not fastify — it's a
test fixture, not a real service, and this sidesteps fastify's default-AJV `removeAdditional:
true` gotcha tower's pilot found entirely, rather than needing to remember to override it in code
that only exists for tests.

## `e2e/` — real browser, per this task's own tier definition

Two real Vite/Node processes, started by Playwright's own `webServer` (`playwright.config.ts`),
so `npm run test:e2e` is a single command with no manual setup:

1. **`spec/fixtures/fake-tower-server.ts`** run standalone (`tsx`) — the same fixture the
   integration tier uses, plus three e2e-only routes: `/__reset` (clears in-memory state between
   specs), `/__jwks` + `/__sign` (mints a real internal JWT signed by a keypair this fixture
   generates and publishes — see "Auth in e2e" below), and static-file serving for the
   widget-embed fixture page.
2. **The actual built admin app** (`npm run build && npm run preview`) — the same artifact
   `adapter-node` produces for real deployment, with `TOWER_BASE_URL`/`INTERNAL_JWT_JWKS_URL`
   pointed at the fake backend above via env vars.

Three flows, matching this task's own framing:

- `e2e/admin-applications.spec.ts` — login → overview → manage an application (create, edit,
  issue/revoke a usage credential, delete) → verify section gating denies both nav visibility
  *and* direct URL access for an account without the grant, and that an unauthenticated visit is
  rejected outright.
- `e2e/hosted-oauth2-select.spec.ts` / `signup.spec.ts` — the two hosted pages implemented in this
  slice (see "Deferred" below for the other two).
- `e2e/widget-embed.spec.ts` — a **plain HTML file** (`e2e/fixtures/static/index.html`, no
  SvelteKit, no build step) loading the built widget bundle via a single `<script type="module">`
  tag, exactly as Story 011 requires this be proven: "verifying it actually renders and behaves
  outside the SvelteKit app shell." It also asserts the host page's CSS custom properties
  (`--authstar-color-primary`) actually reach the widget through its shadow boundary — the
  theming contract's own most important property, not just that the tag renders at all.

### Auth in e2e

There's no real signet/portcullis in this test environment, so `e2e/fixtures/auth.ts` mints a
**real, cryptographically valid** internal JWT: the fake backend generates an ES256 keypair at
startup, publishes it at `GET /__jwks` (which the admin server's `INTERNAL_JWT_JWKS_URL` points
at), and signs arbitrary claims on request via `POST /__sign`, which also sets `tenant` on the
token's own protected header (ADR 0089) — the same place a real portcullis puts it.
`authenticateAs()` calls that, then attaches the resulting `Authorization: Bearer` header to the
browser context via `setExtraHTTPHeaders` before navigating — so the *real*
`hooks.server.ts`/`verifyInternalJwt` code path runs, not a bypassed one. There used to also be an
`x-authstar-tenant` header set here; see "ADR 0089" below for why that's gone.

### A real bug this pass found

**Playwright's default `fullyParallel: true` raced multiple spec files against the one shared,
stateful fake backend process** — `admin-applications.spec.ts`'s tests all create/edit/delete an
application named `widgetco` under tenant `acme`, and several specs call `POST /__reset` in their
own `beforeEach`. Running workers concurrently produced a real, intermittent failure (issuing a
usage credential 404'd because a *different* test's `/__reset` had just wiped the application out
from under it mid-test) — not a flaky test, a genuine design mismatch between "one shared backend
process" and "parallel workers." Fixed by setting `fullyParallel: false` / `workers: 1`
(`playwright.config.ts`) rather than giving every worker its own backend instance, judged not
worth the added complexity for a 10-test suite.

---

# Coverage

Per the driving task's instruction to prioritize a coherent, fully-tested vertical slice over
shallow coverage everywhere, this pass implements **4 of the 11 web Stories** end to end —
real server code, real (if fake-backed) tests in every applicable tier, not stub routes:

| Story | What's implemented | Depth |
|---|---|---|
| 001 — App shell, auth, section gating | `hooks.server.ts` (internal-JWT verification), `src/lib/permissions.ts` (the ADR 0049 section table), `src/lib/server/guard.ts` (route-level enforcement), `(admin)/+layout.server.ts`/`+layout.svelte` + `Nav.svelte` | Full — unit tests, component test, e2e (nav hiding + route guard + 401/403 both proven) |
| 003 — Applications | List, Create (all sub-sections' fields: basic info, hosts+primary-host→publicUrl derivation, upstream, CORS, exempt paths, exposed providers), Edit (slug immutability enforced server-side), Delete (soft alias), usage-reporting credentials (issue with one-time-reveal, revoke) | Full — behavior tests for every action, integration test against real HTTP, e2e for the full create→edit→delete→credential flow |
| 010 — Hosted Pages | `/oauth2/select` (header-only, no live call), public `/signup` (the one browser-direct-to-tower call in the whole design) | Partial — these two of four; see Deferred |
| 011 — Embeddable Widgets | `<authstar-upgrade-button>` (static), `<authstar-subscription-status>` (fetch-driven, all states incl. `past_due`/`null`/error) | Partial — 2 of 6; see Deferred. Chosen specifically as one representative of each widget shape (no-fetch vs. fetch-with-state) |

## Test counts (all green as of this pass)

- `spec/behavior/`: **41 tests**, 7 files
- `spec/components/`: **13 tests**, 3 files
- `spec/integration/`: **4 tests**, 1 file
- `e2e/`: **10 tests**, 4 files
- **Total: 68 tests, all passing.** `npm run build`, `npm run build:widgets`, `npm run
  typecheck`, and `npm run check` (svelte-check) are all clean.
- **Updated by the ADR 0089 tenant-resolution fix**: `spec/behavior/` is now 46 tests (5 new,
  covering the token-header tenant hint and the stricter `sub`/`idp`/`identityHash`/
  `enrichmentStatus` validation `@bytepunx/authstar-core` enforces that this app's old hand-rolled
  parsing didn't) — 73 tests total, all three tiers plus e2e still green.

---

# Deferred — explicitly out of scope for this pass

**Stories not touched at all:**

- **002 — Overview**: the three permission-gated tiles (Active Users via chronicle, Revenue
  Summary via keep, merged Recent Activity across tower/keep/herald). The shell's own root route
  (`/`) exists and is tested as part of Story 001's guard, but renders a plain section-links list,
  not the real tiles — no chronicle/keep client stubs were built for this pass.
- **004 — Identity & Access** (providers, role definitions, accounts, invites)
- **005 — Billing**
- **006 — Communications**
- **007 — Analytics**
- **008 — Privacy & Compliance**
- **009 — Settings**

**Partially covered Stories:**

- **010 — Hosted Pages**: `/_authstar/upgrade` (checkout initiation via keep) and
  `/_authstar/link/confirm` (identity-linking confirmation) are not implemented — both need
  either a keep client (`/_authstar/upgrade`) or portcullis-owned POST semantics
  (`/_authstar/link/confirm`) this pass didn't build.
- **011 — Embeddable Widgets**: `<authstar-account-summary>` (identity/roles + linked-identity
  diffing against `/oauth2/providers`), `<authstar-usage-meter>`, `<authstar-invite-widget>`
  (permission-gated create), `<authstar-data-export-button>` are not implemented. The two that
  are cover the category's two structurally different shapes (static vs. fetch-with-loading/
  error/empty states) that the other four would mostly repeat.

**Judgment calls / documented assumptions (not verified against a portcullis-side spec, since
none exists yet in this design repo at the header-name level):**

- The internal-JWT header itself (`Authorization: Bearer`, portcullis Story 010) is spec'd and
  followed exactly. The **hosted-page branding/provider headers** (`x-authstar-tenant-branding`,
  `x-authstar-providers`, read in `(hosted)/oauth2/select/+page.server.ts`) are this repo's own
  reasonable default — ADR 0066 says portcullis "attaches [them] directly to the proxied request
  as headers" but no story in this repo names the literal header strings. Called out in-code
  where it's read, not asserted as settled.
- **ADR 0089: tenant resolution for JWKS — now fixed, was a real bug, not just a gap.** This app
  used to read a `x-authstar-tenant` request header to know which tenant's session to build --
  ADR 0089 confirmed directly that nothing on portcullis's real reverse-proxy path ever sets
  this; it was never wired to anything real. `hooks.server.ts`/`jwt.ts` now use
  `@bytepunx/authstar-core`'s `verifyInternalJwt`/`perTenantJwksKeyProvider`: the internal JWT
  carries its own tenant hint on its protected header (set by portcullis at mint time), read
  *before* verification to resolve `https://admin.<tenant-slug>.<baseDomain>/.well-known/
  jwks.json` (portcullis's real JWKS route, ADR 0086/0087) and *again*, from the verified claims,
  to build `Session.tenantSlug` — never from a request header. Configured via
  `AUTHSTAR_BASE_DOMAIN`. `INTERNAL_JWT_JWKS_URL`, if set, still overrides with one fixed JWKS
  URL (`jwksKeyProvider`) — what e2e/dev point at a fixture server, see `playwright.config.ts`.
- **CORS on the public signup page**: tower's own CORS configuration for `signup.{baseDomain}`
  (Story 010) is entirely tower's own concern; this repo's `PUBLIC_TOWER_BASE_URL` env var and
  the fake backend's permissive `access-control-allow-origin: *` (fixture-only) are what let the
  e2e spec prove the browser-direct-fetch shape actually works, not a statement about tower's real
  CORS config.

**Widget build/publish pipeline**: `vite.widgets.config.ts` produces `dist-widgets/` (ES + IIFE)
locally; there's no npm-publish or CDN-hosting step, which Story 011 itself explicitly marks as
"an implementation/tooling concern, not a widget behavior" out of its own scope.

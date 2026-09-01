// Plain process.env reads rather than $env/dynamic/private -- keeps this
// module importable from plain vitest (no SvelteKit runtime needed) for the
// behavior tier, while still working unchanged under the real `vite
// build`/adapter-node server, which also just reads process.env at runtime.
// Per claude.md, real deployments source these through signet, not a local
// .env file -- this module only cares about the resulting env vars, not how
// they got set.
//
// ADR 0102 / Story 006: `heraldUrl` used to live here too. An audit
// confirmed it was dead config -- `loadEnv().heraldUrl` was never read by
// any route, and `createHeraldClient` (herald-client.ts) is never invoked
// anywhere; rotate-keys routes through tower's client instead (see
// routes/api/tenants/[slug]/rotate-keys/+server.ts). Rather than wire a
// signet-sourced field for a value nothing reads, it's removed entirely
// here, along with the HERALD_URL env var. herald-client.ts itself is left
// in place (still exported, still covered by its own unit tests) -- deleting
// dead-but-tested code is out of this story's scope.
//
// ADR 0102 also brings `towerUrl` into signet's scope: Env-Only Mode (no
// SIGNET_ADDR) is `loadEnv` exactly as below, unchanged. Signet-Configured
// Mode (SIGNET_ADDR set) sources `towerUrl` from the fetched bundle instead,
// overriding TOWER_URL -- see `signet-config.ts` for the startup dial, which
// calls `setSignetOverride` once, before any request is served
// (`hooks.server.ts`'s `init` hook). `loadEnv` itself stays a pure function
// of its `source` argument; the override is deliberately kept out of its
// signature (module-scoped, set at most once per process in real
// deployments) so every existing call site -- and every existing test, none
// of which ever call `setSignetOverride` -- keeps working unchanged.

export interface StewardEnv {
  towerUrl: string
}

let signetOverride: StewardEnv | undefined

/**
 * Installs (or, passed `undefined`, clears) the signet-sourced env that
 * `loadEnv` returns for the rest of this process's lifetime. Real
 * deployments call this at most once, at server startup, before any request
 * is served (Signet-Configured Mode only -- see `signet-config.ts`).
 * Exported `undefined`-clearable so tests can reset module state between
 * cases.
 */
export function setSignetOverride(env: StewardEnv | undefined): void {
  signetOverride = env
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): StewardEnv {
  if (signetOverride) return signetOverride
  return {
    towerUrl: source.TOWER_URL ?? 'http://localhost:3000',
  }
}

// Plain process.env reads rather than $env/dynamic/private -- keeps this
// module importable from plain vitest (no SvelteKit runtime needed) for the
// behavior tier, while still working unchanged under the real `vite
// build`/adapter-node server, which also just reads process.env at runtime.
// Per claude.md, real deployments source these through signet, not a local
// .env file -- this module only cares about the resulting env vars, not how
// they got set.

export interface StewardEnv {
  towerUrl: string
  heraldUrl: string
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): StewardEnv {
  return {
    towerUrl: source.TOWER_URL ?? 'http://localhost:3000',
    heraldUrl: source.HERALD_URL ?? 'http://localhost:3300',
  }
}

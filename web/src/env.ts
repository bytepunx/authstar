import { defineEnvVars } from '@sveltejs/kit/env'

// The environment variables web reads, which SvelteKit 3 exposes through
// `$app/env/private` and `$app/env/public` (it replaced `$env/dynamic/*`).
// Every one is optional and read when the app starts: src/lib/server/config.ts
// decides which are required for the mode it runs in (ADR 0102), and the
// signup page falls back to a local default. See .env.example for each one.
const optional = (value: string | undefined) => value

export const variables = defineEnvVars({
  TOWER_BASE_URL: { schema: optional, description: "tower's base URL in Env-Only Mode" },
  KEEP_BASE_URL: { schema: optional, description: "keep's base URL in Env-Only Mode" },
  INTERNAL_JWT_JWKS_URL: {
    schema: optional,
    description: 'a fixed JWKS endpoint for the internal JWT in Env-Only Mode',
  },
  SIGNET_ADDR: { schema: optional, description: "signet's workload address; set, it selects Signet-Configured Mode" },
  SIGNET_NAMESPACE: { schema: optional, description: "web's signet namespace, required with SIGNET_ADDR" },
  SIGNET_SERVICE: { schema: optional, description: "web's signet service name, 'web' when unset" },
  SIGNET_TRUST_DOMAIN: { schema: optional, description: "signet's SPIFFE trust domain, required with SIGNET_ADDR" },
  PUBLIC_TOWER_BASE_URL: {
    public: true,
    schema: optional,
    description: "tower's browser-visible base URL, which the public signup page calls",
  },
})

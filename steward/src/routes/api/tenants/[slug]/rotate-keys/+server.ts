// Story 005 -- Rotate Tenant Keys.
// `POST /operator/tenants/{tenantSlug}/rotate-keys { keys: [...] }`
// (tower Story 011).
import type { RequestHandler } from './$types.js'
import { createTowerClient } from '$lib/server/tower-client.js'
import { loadEnv } from '$lib/server/env.js'
import { extractOperatorAuth } from '$lib/server/request-auth.js'
import { respondFromBackend } from '$lib/server/respond.js'
import type { RotateTenantKeysRequest } from '$lib/types.js'

const VALID_KEYS = new Set(['session', 'internal', 'identity-hash'])

export const POST: RequestHandler = async (event) => {
  const { token, actorLabel } = extractOperatorAuth(event)
  const env = loadEnv()
  const tower = createTowerClient({ baseUrl: env.towerUrl, fetchImpl: event.fetch })

  const body = (await event.request.json()) as RotateTenantKeysRequest
  if (!Array.isArray(body.keys) || body.keys.length === 0 || !body.keys.every((k) => VALID_KEYS.has(k))) {
    return respondFromBackend({
      ok: false,
      kind: 'http',
      status: 400,
      body: { error: 'keys must be a non-empty array of session|internal|identity-hash' },
    })
  }

  const result = await tower.rotateTenantKeys(token, actorLabel!, event.params.slug!, body)
  return respondFromBackend(result)
}

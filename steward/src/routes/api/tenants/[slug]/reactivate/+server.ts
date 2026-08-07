// Story 002 -- the inline Reactivate action on a suspended tenant's search
// result row. `PATCH /operator/tenants/{slug} { status: "active" }`
// (tower Story 011) -- the only path back for a self-suspended tenant.
import type { RequestHandler } from './$types.js'
import { createTowerClient } from '$lib/server/tower-client.js'
import { loadEnv } from '$lib/server/env.js'
import { extractOperatorAuth } from '$lib/server/request-auth.js'
import { respondFromBackend } from '$lib/server/respond.js'

export const POST: RequestHandler = async (event) => {
  const { token, actorLabel } = extractOperatorAuth(event)
  const env = loadEnv()
  const tower = createTowerClient({ baseUrl: env.towerUrl, fetchImpl: event.fetch })

  const result = await tower.reactivateTenant(token, actorLabel!, event.params.slug!)
  return respondFromBackend(result)
}

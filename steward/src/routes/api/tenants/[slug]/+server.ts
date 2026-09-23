// ADR 0091 -- single-tenant detail read, used to surface a tenant's domain
// (and therefore its authstar.<domain> admin URL) on the detail page.
// `GET /tenants/:slug` on tower's own direct ingress, not the operator
// tree -- see tower-client.ts's getTenant for why.
import type { RequestHandler } from './$types.js'
import { createTowerClient } from '$lib/server/tower-client.js'
import { loadEnv } from '$lib/server/env.js'
import { extractOperatorAuth } from '$lib/server/request-auth.js'
import { respondFromBackend } from '$lib/server/respond.js'

export const GET: RequestHandler = async (event) => {
  const { token } = extractOperatorAuth(event)
  const env = loadEnv()
  const tower = createTowerClient({ baseUrl: env.towerUrl, fetchImpl: event.fetch })

  const result = await tower.getTenant(token, event.params.slug!)
  return respondFromBackend(result)
}

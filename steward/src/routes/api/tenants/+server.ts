// Story 002 -- Tenant Search (`GET`) and Create Tenant (`POST`).
import type { RequestHandler } from './$types.js'
import { createTowerClient } from '$lib/server/tower-client.js'
import { loadEnv } from '$lib/server/env.js'
import { extractOperatorAuth } from '$lib/server/request-auth.js'
import { respondFromBackend } from '$lib/server/respond.js'
import type { CreateTenantRequest } from '$lib/types.js'

export const GET: RequestHandler = async (event) => {
  const { token } = extractOperatorAuth(event)
  const env = loadEnv()
  const tower = createTowerClient({ baseUrl: env.towerUrl, fetchImpl: event.fetch })

  const search = event.url.searchParams.get('search') ?? undefined
  const limitParam = event.url.searchParams.get('limit')
  const offsetParam = event.url.searchParams.get('offset')

  const result = await tower.listTenants(token, {
    search,
    limit: limitParam ? Number(limitParam) : undefined,
    offset: offsetParam ? Number(offsetParam) : undefined,
  })
  return respondFromBackend(result)
}

export const POST: RequestHandler = async (event) => {
  // POST /tenants isn't on tower's operator tree (tower Story 012's own
  // standalone ingress) -- no X-Operator-Actor requirement here.
  const { token } = extractOperatorAuth(event, { requireActor: false })
  const env = loadEnv()
  const tower = createTowerClient({ baseUrl: env.towerUrl, fetchImpl: event.fetch })

  const body = (await event.request.json()) as CreateTenantRequest
  const result = await tower.createTenant(token, body)
  return respondFromBackend(result)
}

// Story 004 -- a tenant's recent activity, read-only, proxied to tower's
// operator-scoped `GET /operator/tenants/{tenantSlug}/activity`
// (tower/src/routes/activity.ts). Tower validates `limit` (1 to 200,
// default 50) and `cursor` and answers 400 or 404 itself; steward forwards
// both as given, as the tenant search route does with its own paging.
import type { RequestHandler } from './$types.js'
import { createTowerClient } from '#lib/server/tower-client.js'
import { loadEnv } from '#lib/server/env.js'
import { extractOperatorAuth } from '#lib/server/request-auth.js'
import { respondFromBackend } from '#lib/server/respond.js'

export const GET: RequestHandler = async (event) => {
  const { token } = extractOperatorAuth(event)
  const env = loadEnv()
  const tower = createTowerClient({ baseUrl: env.towerUrl, fetchImpl: event.fetch })

  const limitParam = event.url.searchParams.get('limit')
  const cursor = event.url.searchParams.get('cursor') ?? undefined

  const result = await tower.getActivity(token, event.params.slug!, {
    limit: limitParam ? Number(limitParam) : undefined,
    cursor,
  })
  return respondFromBackend(result)
}

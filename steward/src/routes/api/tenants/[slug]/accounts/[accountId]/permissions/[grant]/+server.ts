// Story 003 Admin Access -- revoke a permission grant.
// `DELETE /operator/tenants/{tenantSlug}/accounts/{accountId}/permissions/{grant}`
// (tower Story 005).
import type { RequestHandler } from './$types.js'
import { createTowerClient } from '$lib/server/tower-client.js'
import { loadEnv } from '$lib/server/env.js'
import { extractOperatorAuth } from '$lib/server/request-auth.js'
import { respondFromBackend } from '$lib/server/respond.js'

export const DELETE: RequestHandler = async (event) => {
  const { token, actorLabel } = extractOperatorAuth(event)
  const env = loadEnv()
  const tower = createTowerClient({ baseUrl: env.towerUrl, fetchImpl: event.fetch })

  const result = await tower.revokePermission(
    token,
    actorLabel!,
    event.params.slug!,
    event.params.accountId!,
    event.params.grant!,
  )
  return respondFromBackend(result)
}

// Story 003 Admin Access -- grant a permission on an existing account.
// `POST /operator/tenants/{tenantSlug}/accounts/{accountId}/permissions`
// (tower Story 005). Exempt from the normal `permissions:manage` gate --
// the operator bearer token itself is the authorization (ADR 0021).
import type { RequestHandler } from './$types.js'
import { createTowerClient } from '$lib/server/tower-client.js'
import { loadEnv } from '$lib/server/env.js'
import { extractOperatorAuth } from '$lib/server/request-auth.js'
import { respondFromBackend } from '$lib/server/respond.js'
import type { PermissionGrant } from '$lib/types.js'

export const POST: RequestHandler = async (event) => {
  const { token, actorLabel } = extractOperatorAuth(event)
  const env = loadEnv()
  const tower = createTowerClient({ baseUrl: env.towerUrl, fetchImpl: event.fetch })

  const grant = (await event.request.json()) as PermissionGrant
  const result = await tower.grantPermission(token, actorLabel!, event.params.slug!, event.params.accountId!, grant)
  return respondFromBackend(result)
}

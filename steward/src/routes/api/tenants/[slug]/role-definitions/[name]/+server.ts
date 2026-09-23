// authstar-steward#1 -- retire a role definition.
// `DELETE /operator/tenants/{tenantSlug}/role-definitions/{id}` (tower's
// role-definitions.ts) -- soft alias for PATCH {status:'retired'}. Tower's
// `:id` is the actor's own composite key (tenant:name or
// tenant:application:name), never returned to a caller directly -- the
// tower-client computes it from name+scope the same way tower's own
// keyFor does, same reasoning as revokePermission's scope-in-query
// convention (the caller already knows the definition it's retiring).
import type { RequestHandler } from './$types.js'
import { createTowerClient } from '$lib/server/tower-client.js'
import { loadEnv } from '$lib/server/env.js'
import { extractOperatorAuth } from '$lib/server/request-auth.js'
import { respondFromBackend } from '$lib/server/respond.js'
import type { RoleDefinitionScope } from '$lib/types.js'

export const DELETE: RequestHandler = async (event) => {
  const { token, actorLabel } = extractOperatorAuth(event)
  const env = loadEnv()
  const tower = createTowerClient({ baseUrl: env.towerUrl, fetchImpl: event.fetch })

  const applicationScope = event.url.searchParams.get('applicationScope')
  const scope: RoleDefinitionScope = applicationScope ? { application: applicationScope } : 'tenant'

  const result = await tower.retireRoleDefinition(token, actorLabel!, event.params.slug!, event.params.name!, scope)
  return respondFromBackend(result)
}

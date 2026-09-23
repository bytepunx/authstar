// authstar-steward#1 -- role definition management.
// `GET`/`POST /operator/tenants/{tenantSlug}/role-definitions` (tower's
// role-definitions.ts). NOTE: as of this writing tower only registers the
// tenant-scoped (permission-gated) tree, not an /operator/... equivalent --
// see tower-client.ts's own comment. This proxy is written against the
// operator path tower should expose; it will 404 until that lands.
import type { RequestHandler } from './$types.js'
import { createTowerClient } from '$lib/server/tower-client.js'
import { loadEnv } from '$lib/server/env.js'
import { extractOperatorAuth } from '$lib/server/request-auth.js'
import { respondFromBackend } from '$lib/server/respond.js'
import type { CreateRoleDefinitionRequest } from '$lib/types.js'

export const GET: RequestHandler = async (event) => {
  const { token } = extractOperatorAuth(event)
  const env = loadEnv()
  const tower = createTowerClient({ baseUrl: env.towerUrl, fetchImpl: event.fetch })

  const status = (event.url.searchParams.get('status') as 'active' | 'retired' | null) ?? undefined
  const scope = event.url.searchParams.get('scope') ?? undefined
  const result = await tower.listRoleDefinitions(token, event.params.slug!, { status, scope })
  return respondFromBackend(result)
}

export const POST: RequestHandler = async (event) => {
  const { token, actorLabel } = extractOperatorAuth(event)
  const env = loadEnv()
  const tower = createTowerClient({ baseUrl: env.towerUrl, fetchImpl: event.fetch })

  const body = (await event.request.json()) as CreateRoleDefinitionRequest
  const result = await tower.createRoleDefinition(token, actorLabel!, event.params.slug!, body)
  return respondFromBackend(result)
}

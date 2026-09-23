// Application registration -- `GET`/`POST /operator/tenants/{tenantSlug}/
// applications` (tower's applications.ts). Prerequisite for creating
// application-scoped role definitions (bytepunx/authstar-tower#3).
import type { RequestHandler } from './$types.js'
import { createTowerClient } from '$lib/server/tower-client.js'
import { loadEnv } from '$lib/server/env.js'
import { extractOperatorAuth } from '$lib/server/request-auth.js'
import { respondFromBackend } from '$lib/server/respond.js'
import type { CreateApplicationRequest } from '$lib/types.js'

export const GET: RequestHandler = async (event) => {
  const { token } = extractOperatorAuth(event)
  const env = loadEnv()
  const tower = createTowerClient({ baseUrl: env.towerUrl, fetchImpl: event.fetch })

  const includeDeleted = event.url.searchParams.get('includeDeleted') === 'true'
  const result = await tower.listApplications(token, event.params.slug!, { includeDeleted })
  return respondFromBackend(result)
}

export const POST: RequestHandler = async (event) => {
  const { token, actorLabel } = extractOperatorAuth(event)
  const env = loadEnv()
  const tower = createTowerClient({ baseUrl: env.towerUrl, fetchImpl: event.fetch })

  const body = (await event.request.json()) as CreateApplicationRequest
  const result = await tower.createApplication(token, actorLabel!, event.params.slug!, body)
  return respondFromBackend(result)
}

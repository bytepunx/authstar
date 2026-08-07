// Story 003 Admin Access -- bootstrap path, issue an elevated invite.
// `POST /operator/tenants/{tenantSlug}/invites` (tower Story 007's invite
// creation, operator tree).
import type { RequestHandler } from './$types.js'
import { createTowerClient } from '$lib/server/tower-client.js'
import { loadEnv } from '$lib/server/env.js'
import { extractOperatorAuth } from '$lib/server/request-auth.js'
import { respondFromBackend } from '$lib/server/respond.js'
import type { InviteRequest } from '$lib/types.js'

export const POST: RequestHandler = async (event) => {
  const { token, actorLabel } = extractOperatorAuth(event)
  const env = loadEnv()
  const tower = createTowerClient({ baseUrl: env.towerUrl, fetchImpl: event.fetch })

  const body = (await event.request.json()) as InviteRequest
  const result = await tower.createInvite(token, actorLabel!, event.params.slug!, body)
  return respondFromBackend(result)
}

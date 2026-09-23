// Story 003 Admin Access -- read (filtered client-side to accounts with a
// non-empty `permissions` array) and email search share this one route,
// `GET /operator/tenants/{tenantSlug}/accounts` (tower Story 005), matching
// ADR 0048's own reasoning that permission holders are a small enough
// population not to need a dedicated backend filter.
import type { RequestHandler } from './$types.js'
import { createTowerClient } from '$lib/server/tower-client.js'
import { loadEnv } from '$lib/server/env.js'
import { extractOperatorAuth } from '$lib/server/request-auth.js'
import { respondFromBackend } from '$lib/server/respond.js'

export const GET: RequestHandler = async (event) => {
  const { token } = extractOperatorAuth(event)
  const env = loadEnv()
  const tower = createTowerClient({ baseUrl: env.towerUrl, fetchImpl: event.fetch })

  const email = event.url.searchParams.get('email') ?? undefined
  const result = await tower.listAccounts(token, event.params.slug!, { email })
  return respondFromBackend(result)
}

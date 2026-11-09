// Story 004 -- Stuck Erasure Requests, cross-tenant (ADR 0075).
// `GET /operator/erasure-requests/stuck?olderThanHours=` (tower's
// routes/operator.ts) answers a bare array of pending requests older than
// the threshold, oldest first, each with the services still outstanding.
// The threshold is the operator's control, so it is forwarded to tower
// rather than applied to a fixed result here.
import type { RequestHandler } from './$types.js'
import { createTowerClient } from '#lib/server/tower-client.js'
import { loadEnv } from '#lib/server/env.js'
import { extractOperatorAuth } from '#lib/server/request-auth.js'
import { respondFromBackend } from '#lib/server/respond.js'

const DEFAULT_OLDER_THAN_HOURS = 72

export const GET: RequestHandler = async (event) => {
  const { token } = extractOperatorAuth(event)

  const raw = event.url.searchParams.get('olderThanHours')
  const olderThanHours = raw === null ? DEFAULT_OLDER_THAN_HOURS : /^\d+$/.test(raw) ? Number(raw) : NaN
  if (!Number.isSafeInteger(olderThanHours) || olderThanHours <= 0) {
    return respondFromBackend({
      ok: false,
      kind: 'http',
      status: 400,
      body: { error: 'olderThanHours must be a positive whole number of hours' },
    })
  }

  const env = loadEnv()
  const tower = createTowerClient({ baseUrl: env.towerUrl, fetchImpl: event.fetch })
  const result = await tower.getStuckErasureRequests(token, olderThanHours)
  return respondFromBackend(result)
}

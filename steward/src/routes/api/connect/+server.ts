// Story 001 -- the Connect screen's token-confirmation call.
//
// Deliberately not gated by extractOperatorAuth: this *is* the request that
// finds out whether a token is any good, so there's no prior "Authorization
// header" to check -- the token travels in the JSON body instead, exactly
// once, for exactly this call. Every other `/api/**` route in this service
// expects the browser to already hold a confirmed token and send it as a
// bearer header from here on.
import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types.js'
import { createTowerClient } from '$lib/server/tower-client.js'
import { loadEnv } from '$lib/server/env.js'
import type { ConnectResult } from '$lib/types.js'

export const POST: RequestHandler = async (event) => {
  const body = (await event.request.json().catch(() => null)) as { token?: string } | null
  const token = body?.token?.trim()

  if (!token) {
    return json({ ok: false, reason: 'invalid-token', message: 'a token is required' } satisfies ConnectResult, { status: 400 })
  }

  const env = loadEnv()
  const tower = createTowerClient({ baseUrl: env.towerUrl, fetchImpl: event.fetch })
  const result = await tower.confirmToken(token)

  if (result.ok) {
    return json({
      ok: true,
      towerUrl: env.towerUrl,
      tenantCount: result.body.total,
    } satisfies ConnectResult)
  }

  if (result.kind === 'network') {
    return json(
      { ok: false, reason: 'unreachable', message: `can't reach tower: ${result.message}` } satisfies ConnectResult,
      { status: 200 },
    )
  }

  if (result.status === 401 || result.status === 403) {
    return json(
      { ok: false, reason: 'invalid-token', message: 'tower rejected this token' } satisfies ConnectResult,
      { status: 200 },
    )
  }

  return json(
    { ok: false, reason: 'unknown', message: `tower returned ${result.status}` } satisfies ConnectResult,
    { status: 200 },
  )
}

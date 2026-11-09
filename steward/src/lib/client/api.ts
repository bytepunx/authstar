// Client-side fetch wrapper for steward's own `/api/**` proxy endpoints.
// Attaches the in-memory bearer token (and, for mutations, the "acting as"
// label) from the session store -- steward's server never holds these
// itself, so every call must carry them fresh.
//
// Story 001: "if tower/keep ever reject the token... steward drops back to
// the Connect screen." A 401 from any `/api/**` call means exactly that --
// handled here, once, rather than in every caller.

import { goto } from '$app/navigation'
import { session } from './session.svelte.js'

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, body: unknown) {
    super(typeof body === 'object' && body && 'message' in body ? String((body as { message: unknown }).message) : `request failed (${status})`)
    this.status = status
    this.body = body
  }
}

export interface ApiCallOptions {
  method?: string
  body?: unknown
}

export async function apiCall<T>(path: string, options: ApiCallOptions = {}): Promise<T> {
  if (!session.token) {
    throw new ApiError(401, { message: 'not connected' })
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.token}`,
  }
  if (session.actorLabel) {
    headers['X-Operator-Actor'] = session.actorLabel
  }
  const method = options.method ?? 'GET'
  // Every mutating call says it is JSON, bodiless ones too: SvelteKit 3's CSRF
  // check refuses a POST/PUT/PATCH/DELETE with no Content-Type unless its
  // Origin matches the server's, and adapter-node takes that to be https while
  // operators reach steward over a plain-http port-forward.
  if (options.body !== undefined || method !== 'GET') {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(path, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  if (response.status === 401) {
    session.disconnect()
    await goto('/connect?reason=expired')
    throw new ApiError(401, { message: 'session no longer valid' })
  }

  const text = await response.text()
  const parsed = text.length > 0 ? JSON.parse(text) : undefined

  if (!response.ok) {
    throw new ApiError(response.status, parsed)
  }

  return parsed as T
}

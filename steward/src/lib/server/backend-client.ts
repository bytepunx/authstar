// Shared low-level HTTP helper for steward's two backend clients
// (tower-client.ts, herald-client.ts). Steward never persists the operator
// bearer token -- every call takes it fresh as an argument, forwarded
// straight through as `Authorization: Bearer` (Story 001's "one shared
// operator token, both backends" model, ADR 0045).
//
// Distinguishes network failure (backend unreachable -- can't even complete
// the fetch) from an HTTP error response (backend reachable, said no) --
// Story 001 requires steward to show these as genuinely different problems
// ("invalid token" vs. "can't reach tower").

export type BackendResult<T> =
  | { ok: true; status: number; body: T }
  | { ok: false; kind: 'network'; message: string }
  | { ok: false; kind: 'http'; status: number; body: unknown }

export interface BackendRequestOptions {
  method?: string
  path: string
  token: string
  actorLabel?: string
  body?: unknown
  query?: Record<string, string | number | undefined>
}

export type FetchLike = typeof fetch

export function buildUrl(baseUrl: string, path: string, query?: Record<string, string | number | undefined>): string {
  const url = new URL(path, baseUrl)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

export async function backendRequest<T>(
  fetchImpl: FetchLike,
  baseUrl: string,
  options: BackendRequestOptions,
): Promise<BackendResult<T>> {
  const url = buildUrl(baseUrl, options.path, options.query)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.token}`,
  }
  if (options.actorLabel) {
    headers['X-Operator-Actor'] = options.actorLabel
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  let response: Response
  try {
    response = await fetchImpl(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
  } catch (err) {
    return { ok: false, kind: 'network', message: err instanceof Error ? err.message : 'network error' }
  }

  const text = await response.text()
  const parsed = text.length > 0 ? safeJsonParse(text) : undefined

  if (!response.ok) {
    return { ok: false, kind: 'http', status: response.status, body: parsed }
  }

  return { ok: true, status: response.status, body: parsed as T }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

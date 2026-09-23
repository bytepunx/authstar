// A scriptable fetch stand-in for tower/herald in the behavior tier --
// steward's own route handlers are exercised for real, but the backend HTTP
// call they make is answered from an in-memory script instead of a real
// network call (the same "real code, faked dependency" split tower's own
// behavior tier uses for consequent, just at steward's actual seam: it has
// no database of its own, only HTTP calls out).

export interface ScriptedResponse {
  status: number
  body?: unknown
}

export type FetchScript = (url: string, init: RequestInit | undefined) => ScriptedResponse | 'network-error'

export function makeFakeFetch(script: FetchScript): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const result = script(url, init)
    if (result === 'network-error') {
      throw new TypeError('fetch failed: connection refused')
    }
    // A 204/304 Response must have a null body -- the Fetch API throws if
    // constructed otherwise, even with an empty string.
    const body = result.body !== undefined ? JSON.stringify(result.body) : null
    return new Response(result.status === 204 || result.status === 304 ? null : body, {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
}

export function capturingFakeFetch(response: ScriptedResponse | 'network-error') {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = []
  const fetchImpl = makeFakeFetch((url, init) => {
    calls.push({ url, init })
    return response
  })
  return { fetchImpl, calls }
}

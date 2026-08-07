// Minimal stand-in for SvelteKit's RequestEvent, built by hand rather than
// booting a real SvelteKit server -- mirrors tower's own behavior-tier
// philosophy (fastify.inject(), no real network) adapted to SvelteKit's
// shape: import a route module's exported handler directly and call it with
// a constructed event. Only the fields steward's own `+server.ts` handlers
// actually touch (`request`, `params`, `url`, `fetch`) are populated; every
// other RequestEvent field a real SvelteKit server provides is irrelevant to
// these handlers and deliberately left out.

export interface FakeEventOptions {
  method?: string
  path: string
  params?: Record<string, string>
  headers?: Record<string, string>
  body?: unknown
  fetchImpl?: typeof fetch
}

export function fakeEvent(options: FakeEventOptions) {
  const url = new URL(options.path, 'http://steward.test')
  const headers = new Headers(options.headers ?? {})
  const request = new Request(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  return {
    request,
    params: options.params ?? {},
    url,
    fetch: options.fetchImpl ?? fetch,
  }
}

export async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  return text.length > 0 ? JSON.parse(text) : undefined
}

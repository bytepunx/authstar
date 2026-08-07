// Maps a BackendResult (tower-client.ts / herald-client.ts) onto the HTTP
// response steward's own `+server.ts` proxy endpoints send back to the
// browser. Centralized so every route treats "backend unreachable" vs.
// "backend rejected the request" consistently (Story 001's distinct-messages
// requirement), rather than each route re-deriving its own status mapping.

import { json } from '@sveltejs/kit'
import type { BackendResult } from './backend-client.js'

export function respondFromBackend<T>(result: BackendResult<T>): Response {
  if (result.ok) {
    return json(result.body, { status: result.status })
  }
  if (result.kind === 'network') {
    return json({ error: 'unreachable', message: result.message }, { status: 502 })
  }
  return json(result.body ?? { error: 'backend error' }, { status: result.status })
}

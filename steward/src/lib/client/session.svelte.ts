// Story 001's session model: token + "acting as" label held in memory for
// the tab's lifetime, `sessionStorage` at most -- never `localStorage`.
// Closing the tab or navigating away loses the session entirely; a fresh
// port-forward means re-entering the token. This module is the one place
// that touches sessionStorage so that discipline isn't scattered.

import { browser } from '$app/environment'

const STORAGE_KEY = 'steward.session'

interface StoredSession {
  token: string
  actorLabel: string
  towerUrl?: string
}

class SessionStore {
  token = $state<string | undefined>(undefined)
  actorLabel = $state<string | undefined>(undefined)
  towerUrl = $state<string | undefined>(undefined)

  constructor() {
    if (browser) {
      this.restore()
    }
  }

  get connected(): boolean {
    return Boolean(this.token && this.actorLabel)
  }

  private restore() {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as StoredSession
      this.token = parsed.token
      this.actorLabel = parsed.actorLabel
      this.towerUrl = parsed.towerUrl
    } catch {
      sessionStorage.removeItem(STORAGE_KEY)
    }
  }

  connect(token: string, actorLabel: string, towerUrl?: string) {
    this.token = token
    this.actorLabel = actorLabel
    this.towerUrl = towerUrl
    if (browser) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ token, actorLabel, towerUrl } satisfies StoredSession))
    }
  }

  // Story 001: no silent re-auth -- if tower/keep ever reject the token,
  // steward drops back to Connect and discards whatever in-memory tenant
  // context existed.
  disconnect() {
    this.token = undefined
    this.actorLabel = undefined
    this.towerUrl = undefined
    if (browser) {
      sessionStorage.removeItem(STORAGE_KEY)
    }
  }
}

export const session = new SessionStore()

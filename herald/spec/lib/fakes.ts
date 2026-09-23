import type { SignetAdmin } from '../../src/lib/signet-admin.js'

// Shared test double for the injectable `SignetAdmin` interface
// `src/lib/build-app.ts` accepts -- same "fake the interface, not the
// transport" convention tower's/keep's own `spec/lib/fakes.ts` use for the
// identical interface.
export interface SpySignetAdmin extends SignetAdmin {
  calls: Array<{ targetService: 'herald' | 'tower' | 'keep' | 'portcullis', key: string, value: string }>
}

export function createSpySignetAdmin(): SpySignetAdmin {
  const calls: SpySignetAdmin['calls'] = []
  return {
    calls,
    async pushSecret(targetService, key, value) {
      calls.push({ targetService, key, value })
    },
  }
}

import type { adminv1 } from '@bytepunx/signet-client'
import type { SignetAdmin } from '../../src/lib/signet-admin.js'
import type { Publisher } from '../../src/lib/publisher.js'

// Shared test doubles for the injectable interfaces `src/lib/build-app.ts`
// accepts -- same "fake the interface, not the transport" convention this
// codebase (and herald's `comms-consumer.ts` tests) already uses for
// `consequent` itself.

export interface SpySignetAdmin extends SignetAdmin {
  calls: Array<{ targetService: 'tower' | 'portcullis', key: string, value: string }>
  patchCalls: Array<{ targetService: 'tower' | 'portcullis', operations: adminv1.JsonPatchOperation[] }>
}

export function createSpySignetAdmin(): SpySignetAdmin {
  const calls: SpySignetAdmin['calls'] = []
  const patchCalls: SpySignetAdmin['patchCalls'] = []
  return {
    calls,
    patchCalls,
    async pushSecret(targetService, key, value) {
      calls.push({ targetService, key, value })
    },
    async patchConfig(targetService, operations) {
      patchCalls.push({ targetService, operations })
    },
  }
}

export interface SpyPublisher extends Publisher {
  calls: Array<{ routingKey: string, payload: unknown }>
}

export function createSpyPublisher(): SpyPublisher {
  const calls: SpyPublisher['calls'] = []
  return {
    calls,
    async publish(routingKey, payload) {
      calls.push({ routingKey, payload })
    },
  }
}

export function createDeterministicIds(prefix = 'acct'): { nextAccountId: () => string, nextIdentityId: () => string, nextOrganizationId: () => string } {
  let accountCounter = 0
  let identityCounter = 0
  let organizationCounter = 0
  return {
    nextAccountId: () => `${prefix}-${++accountCounter}`,
    nextIdentityId: () => `identity-${++identityCounter}`,
    nextOrganizationId: () => `org-${++organizationCounter}`,
  }
}

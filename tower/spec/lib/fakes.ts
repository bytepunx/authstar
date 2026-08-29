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

// Applies exactly the JSON Patch (RFC 6902) vocabulary tower's own code
// actually emits -- "add" with a trailing "/-" path segment (append), plain
// "test", and "remove" -- against a plain object tree keyed by JSON Pointer
// segments. Not a general RFC 6902 implementation (no "replace"/"move"/
// "copy"); this fake exists to let getConfig/patchConfig round-trip
// realistically in tests, not to validate the patch format itself (signet's
// own server-side tests cover that).
function applyOp(root: Record<string, unknown>, op: adminv1.JsonPatchOperation): void {
  const segments = op.path.split('/').filter((s) => s.length > 0)
  let parent: any = root
  for (let i = 0; i < segments.length - 1; i++) {
    parent = parent[segments[i]]
  }
  const last = segments[segments.length - 1]

  if (op.op === 'add' && last === '-') {
    if (!Array.isArray(parent)) throw new Error(`fake patch: "/-" append target at ${op.path} is not an array`)
    parent.push(op.value)
    return
  }
  if (op.op === 'test') {
    const current = JSON.stringify(parent[last])
    const expected = JSON.stringify(op.value)
    if (current !== expected) {
      throw new Error(`fake patch: test failed at ${op.path} -- expected ${expected}, got ${current}`)
    }
    return
  }
  if (op.op === 'remove') {
    if (Array.isArray(parent)) {
      parent.splice(Number(last), 1)
    } else {
      delete parent[last]
    }
    return
  }
  throw new Error(`fake patch: unsupported op "${op.op}" (this fake only implements add/-, test, remove)`)
}

export function createSpySignetAdmin(): SpySignetAdmin {
  const calls: SpySignetAdmin['calls'] = []
  const patchCalls: SpySignetAdmin['patchCalls'] = []
  const documents: Partial<Record<'tower' | 'portcullis', Record<string, unknown>>> = {}
  let version = 0

  return {
    calls,
    patchCalls,
    async pushSecret(targetService, key, value) {
      calls.push({ targetService, key, value })
    },
    async patchConfig(targetService, operations) {
      patchCalls.push({ targetService, operations })
      documents[targetService] ??= {}
      // "add" at a bare top-level path (e.g. jsonPatchAdd('/tenants/acme', {...}))
      // upserts a whole subtree -- same RFC 6902 add-is-upsert-on-existing-key
      // semantics `provisioning.ts`'s own comment documents.
      for (const op of operations) {
        const segments = op.path.split('/').filter((s) => s.length > 0)
        if (op.op === 'add' && segments[segments.length - 1] !== '-') {
          let parent: any = documents[targetService]
          for (let i = 0; i < segments.length - 1; i++) {
            parent[segments[i]] ??= {}
            parent = parent[segments[i]]
          }
          parent[segments[segments.length - 1]] = op.value
          continue
        }
        applyOp(documents[targetService]!, op)
      }
      version += 1
    },
    async getConfig(targetService) {
      const content = documents[targetService]
      if (content === undefined) return null
      return { content: JSON.parse(JSON.stringify(content)), version }
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

export function createDeterministicIds(prefix = 'acct'): { nextAccountId: () => string, nextIdentityId: () => string, nextOrganizationId: () => string, nextOrganizationMembershipId: () => string } {
  let accountCounter = 0
  let identityCounter = 0
  let organizationCounter = 0
  let membershipCounter = 0
  return {
    nextAccountId: () => `${prefix}-${++accountCounter}`,
    nextIdentityId: () => `identity-${++identityCounter}`,
    nextOrganizationId: () => `org-${++organizationCounter}`,
    nextOrganizationMembershipId: () => `membership-${++membershipCounter}`,
  }
}

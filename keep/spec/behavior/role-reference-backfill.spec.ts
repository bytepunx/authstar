import { describe, expect, it } from 'vitest'
import { createRoleReferenceCache } from '../../src/lib/role-reference-cache.js'
import { createRoleReferenceBackfill, createNoopRoleReferenceBackfill, type TowerReferenceClient } from '../../src/lib/role-reference-backfill.js'

// Behavior tier for the per-tenant startup/on-first-touch backfill (ADR
// 0047). `TowerReferenceClient` is injected directly -- no real HTTP, no
// mocking `fetch` -- exactly the same "inject the interface, fake it in
// tests" convention every other real dependency in this codebase (Stripe,
// signet admin, the entitlement publisher) already uses.

function fakeTowerClient(overrides: Partial<TowerReferenceClient> & { calls?: string[] } = {}): TowerReferenceClient & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    listApplications: overrides.listApplications ?? (async (tenant) => {
      calls.push(`applications:${tenant}`)
      return [{ slug: 'billing', status: 'active' }]
    }),
    listRoleDefinitions: overrides.listRoleDefinitions ?? (async (tenant) => {
      calls.push(`roleDefinitions:${tenant}`)
      return [{ name: 'member', scope: { application: 'billing' }, status: 'active' }]
    }),
  }
}

describe('role reference backfill', () => {
  describe('ensureFresh', () => {
    it('backfills a tenant from tower on first touch, populating both tables', async () => {
      const cache = createRoleReferenceCache()
      const tower = fakeTowerClient()
      const backfill = createRoleReferenceBackfill(cache, tower)

      await backfill.ensureFresh('acme')

      expect(cache.isValid('acme', { application: 'billing', role: 'member' })).toBe(true)
      expect(tower.calls).toEqual(['applications:acme', 'roleDefinitions:acme'])
    })

    it('is a no-op on a second call for an already-backfilled tenant', async () => {
      const cache = createRoleReferenceCache()
      const tower = fakeTowerClient()
      const backfill = createRoleReferenceBackfill(cache, tower)

      await backfill.ensureFresh('acme')
      await backfill.ensureFresh('acme')

      expect(tower.calls).toHaveLength(2) // one applications + one role-definitions call, not four
    })

    it('backfills each tenant independently', async () => {
      const cache = createRoleReferenceCache()
      const tower = fakeTowerClient()
      const backfill = createRoleReferenceBackfill(cache, tower)

      await backfill.ensureFresh('acme')
      await backfill.ensureFresh('other')

      expect(tower.calls).toEqual(['applications:acme', 'roleDefinitions:acme', 'applications:other', 'roleDefinitions:other'])
    })

    it('skips tenant-wide role definitions -- keep only tracks application-scoped ones', async () => {
      const cache = createRoleReferenceCache()
      const tower = fakeTowerClient({
        listRoleDefinitions: async () => [
          { name: 'admin', scope: 'tenant', status: 'active' },
          { name: 'member', scope: { application: 'billing' }, status: 'active' },
        ],
      })
      const backfill = createRoleReferenceBackfill(cache, tower)

      await backfill.ensureFresh('acme')

      expect(cache.isValid('acme', { application: 'billing', role: 'member' })).toBe(true)
    })

    it('marks a suspended application inactive', async () => {
      const cache = createRoleReferenceCache()
      const tower = fakeTowerClient({
        listApplications: async () => [{ slug: 'billing', status: 'suspended' }],
      })
      const backfill = createRoleReferenceBackfill(cache, tower)

      await backfill.ensureFresh('acme')

      expect(cache.isValid('acme', { application: 'billing', role: 'member' })).toBe(false)
    })

    it('leaves the tenant retryable on a failed attempt, rather than marking it backfilled', async () => {
      const cache = createRoleReferenceCache()
      let attempt = 0
      const tower = fakeTowerClient({
        listApplications: async () => {
          attempt += 1
          if (attempt === 1) throw new Error('tower unreachable')
          return [{ slug: 'billing', status: 'active' }]
        },
      })
      const backfill = createRoleReferenceBackfill(cache, tower)

      await expect(backfill.ensureFresh('acme')).rejects.toThrow('tower unreachable')
      expect(cache.isValid('acme', { application: 'billing', role: 'member' })).toBe(false)

      await backfill.ensureFresh('acme') // retries since the first attempt never succeeded
      expect(cache.isValid('acme', { application: 'billing', role: 'member' })).toBe(true)
    })
  })

  describe('refreshAll', () => {
    it('re-backfills every tenant already known, picking up a since-changed status', async () => {
      const cache = createRoleReferenceCache()
      let status = 'active'
      const tower = fakeTowerClient({
        listApplications: async () => [{ slug: 'billing', status }],
      })
      const backfill = createRoleReferenceBackfill(cache, tower)

      await backfill.ensureFresh('acme')
      expect(cache.isValid('acme', { application: 'billing', role: 'member' })).toBe(true)

      status = 'suspended'
      await backfill.refreshAll()

      expect(cache.isValid('acme', { application: 'billing', role: 'member' })).toBe(false)
    })

    it('is a no-op when no tenant has ever been backfilled', async () => {
      const cache = createRoleReferenceCache()
      const tower = fakeTowerClient()
      const backfill = createRoleReferenceBackfill(cache, tower)

      await backfill.refreshAll()

      expect(tower.calls).toHaveLength(0)
    })
  })
})

describe('createNoopRoleReferenceBackfill', () => {
  it('resolves both methods without doing anything', async () => {
    const backfill = createNoopRoleReferenceBackfill()
    await expect(backfill.ensureFresh('acme')).resolves.toBeUndefined()
    await expect(backfill.refreshAll()).resolves.toBeUndefined()
  })
})

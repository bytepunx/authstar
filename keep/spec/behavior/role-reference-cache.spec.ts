import { describe, expect, it } from 'vitest'
import { createRoleReferenceCache } from '../../src/lib/role-reference-cache.js'

// Unit-level coverage for the cache itself (ADR 0047) -- previously only
// exercised indirectly through plan-mappings/trials/coupons behavior specs.
// Now tenant-scoped and mutable (`upsertApplication`/`upsertRoleDefinition`)
// where it used to be a fixed, single-tenant-shaped snapshot.

describe('role reference cache', () => {
  it('is invalid for a role in a tenant that was never seeded or upserted', () => {
    const cache = createRoleReferenceCache()
    expect(cache.isValid('acme', { application: 'billing', role: 'member' })).toBe(false)
  })

  it('accepts an initial tenant-scoped snapshot', () => {
    const cache = createRoleReferenceCache({ acme: { billing: ['member', 'admin'] } })
    expect(cache.isValid('acme', { application: 'billing', role: 'member' })).toBe(true)
    expect(cache.isValid('acme', { application: 'billing', role: 'nonexistent' })).toBe(false)
    expect(cache.isValid('other-tenant', { application: 'billing', role: 'member' })).toBe(false)
  })

  it('requires both the application and the role to be active', () => {
    const cache = createRoleReferenceCache()
    cache.upsertRoleDefinition('acme', 'billing', 'member', true)
    // Application never marked known -- role alone isn't enough.
    expect(cache.isValid('acme', { application: 'billing', role: 'member' })).toBe(false)

    cache.upsertApplication('acme', 'billing', true)
    expect(cache.isValid('acme', { application: 'billing', role: 'member' })).toBe(true)
  })

  it('upsertApplication(..., false) invalidates every role under that application', () => {
    const cache = createRoleReferenceCache({ acme: { billing: ['member'] } })
    expect(cache.isValid('acme', { application: 'billing', role: 'member' })).toBe(true)

    cache.upsertApplication('acme', 'billing', false)
    expect(cache.isValid('acme', { application: 'billing', role: 'member' })).toBe(false)
  })

  it('upsertRoleDefinition(..., false) retires just that one role, leaving the application and other roles alone', () => {
    const cache = createRoleReferenceCache({ acme: { billing: ['member', 'admin'] } })
    cache.upsertRoleDefinition('acme', 'billing', 'member', false)

    expect(cache.isValid('acme', { application: 'billing', role: 'member' })).toBe(false)
    expect(cache.isValid('acme', { application: 'billing', role: 'admin' })).toBe(true)
  })

  it('validateAll reports every invalid entry, not just the first', () => {
    const cache = createRoleReferenceCache({ acme: { billing: ['member'] } })
    const result = cache.validateAll('acme', [
      { application: 'billing', role: 'member' },
      { application: 'billing', role: 'nonexistent' },
      { application: 'reports', role: 'viewer' },
    ])
    expect(result).toEqual({
      valid: false,
      invalid: [
        { application: 'billing', role: 'nonexistent' },
        { application: 'reports', role: 'viewer' },
      ],
    })
  })

  it('validateAll succeeds for an empty list regardless of tenant', () => {
    const cache = createRoleReferenceCache()
    expect(cache.validateAll('never-seen-tenant', [])).toEqual({ valid: true })
  })

  it('keeps applications/roles fully isolated between tenants', () => {
    const cache = createRoleReferenceCache()
    cache.upsertApplication('acme', 'billing', true)
    cache.upsertRoleDefinition('acme', 'billing', 'member', true)

    expect(cache.isValid('acme', { application: 'billing', role: 'member' })).toBe(true)
    expect(cache.isValid('other-tenant', { application: 'billing', role: 'member' })).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { createConsequentSequenceProvider } from '../../src/lib/consequent-sequence-provider.js'

// Behavior tier for the durable `SequenceProvider` (closing the gap
// entitlement-publisher.ts's own header comment used to flag: sequence
// numbers were in-memory-only, reset to zero on every restart). Backed by
// a real `entitlementSequence` consequent actor -- exercised against the
// same in-memory `consequent` adapters every other behavior spec uses, not
// a fake -- proves the actor definition itself works, not just an
// interface contract.

describe('durable entitlement sequence provider (entitlementSequence actor)', () => {
  it('starts at 1 and increments monotonically for the same (tenant, scope)', async () => {
    const consequent = await buildInMemoryConsequent()
    const sequences = createConsequentSequenceProvider(consequent)

    const first = await sequences.next('acme', { account: 'acct-1' })
    const second = await sequences.next('acme', { account: 'acct-1' })
    const third = await sequences.next('acme', { account: 'acct-1' })

    expect([first, second, third]).toEqual([1, 2, 3])
  })

  it('keeps independent counters per account scope', async () => {
    const consequent = await buildInMemoryConsequent()
    const sequences = createConsequentSequenceProvider(consequent)

    await sequences.next('acme', { account: 'acct-1' })
    await sequences.next('acme', { account: 'acct-1' })
    const other = await sequences.next('acme', { account: 'acct-2' })

    expect(other).toBe(1)
  })

  it('keeps independent counters per tenant scope, distinct from account scope', async () => {
    const consequent = await buildInMemoryConsequent()
    const sequences = createConsequentSequenceProvider(consequent)

    await sequences.next('acme', { tenant: 'acme' })
    const accountScoped = await sequences.next('acme', { account: 'acme' })

    expect(accountScoped).toBe(1) // `account: 'acme'` and `tenant: 'acme'` are different keys
  })

  it('keeps independent counters across different tenants for the same account id', async () => {
    const consequent = await buildInMemoryConsequent()
    const sequences = createConsequentSequenceProvider(consequent)

    await sequences.next('acme', { account: 'acct-1' })
    const other = await sequences.next('other-tenant', { account: 'acct-1' })

    expect(other).toBe(1)
  })

  it('survives being read back directly off the actor -- proves real durability, not just interface behavior', async () => {
    const consequent = await buildInMemoryConsequent()
    const sequences = createConsequentSequenceProvider(consequent)

    await sequences.next('acme', { account: 'acct-1' })
    await sequences.next('acme', { account: 'acct-1' })

    const instance = await consequent.fetch('entitlementSequence', 'acme:account:acct-1')
    expect(instance!.state.value).toBe(2)
  })

  it('serializes concurrent next() calls for the same (tenant, scope) into a gap-free sequence', async () => {
    const consequent = await buildInMemoryConsequent()
    const sequences = createConsequentSequenceProvider(consequent)

    const results = await Promise.all(
      Array.from({ length: 10 }, () => sequences.next('acme', { account: 'acct-1' })),
    )

    expect(results.slice().sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })
})

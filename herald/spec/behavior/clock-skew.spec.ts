import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { monotonic, realNow } from '../lib/monotonic-clock.js'
import { uniqueSlug } from '../lib/unique.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'

// Reproduces I-0018: consequent's node-flakes id generator throws
// `NTP clock skew detected` when the wall clock steps back between two
// commands, and the setup file's monotonic clock (spec/lib/monotonic-clock.ts)
// keeps it from doing so.

function steppableClock() {
  let offset = 0
  return {
    now: () => realNow() + offset,
    stepBack: (ms: number) => { offset -= ms },
  }
}

async function createCommunicationType(consequent: ConsequentApi, tenant: string, type: string) {
  await consequent.handle(`${tenant}:${type}`, 'communicationType.create', {
    type, tenant, category: 'transactional', retentionDays: 7,
  })
}

describe('clock skew between two commands (I-0018)', () => {
  let savedNow: () => number

  beforeEach(() => {
    savedNow = Date.now
  })

  afterEach(() => {
    Date.now = savedNow
  })

  it('throws "NTP clock skew detected" when the raw clock steps back', async () => {
    const consequent = await buildInMemoryConsequent()
    const tenant = uniqueSlug('skew-raw')
    const clock = steppableClock()
    Date.now = clock.now

    await createCommunicationType(consequent, tenant, 'first')
    clock.stepBack(5_000)

    await expect(createCommunicationType(consequent, tenant, 'second'))
      .rejects.toThrow('NTP clock skew detected')
  })

  it('handles both commands when the clock is kept monotonic', async () => {
    const consequent = await buildInMemoryConsequent()
    const tenant = uniqueSlug('skew-guarded')
    const clock = steppableClock()
    Date.now = monotonic(clock.now)

    await createCommunicationType(consequent, tenant, 'first')
    clock.stepBack(5_000)
    await createCommunicationType(consequent, tenant, 'second')

    const first = await consequent.fetch('communicationType', `${tenant}:first`)
    const second = await consequent.fetch('communicationType', `${tenant}:second`)
    expect(first!.state.retentionDays).toBe(7)
    expect(second!.state.retentionDays).toBe(7)
  })
})

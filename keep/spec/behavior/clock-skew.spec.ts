import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getBase62Provider } from 'node-flakes'
import { monotonic, realNow } from '../lib/monotonic-clock.js'

// Reproduces I-0018 on keep's own id path: a `node-flakes` provider, as
// `src/lib/ids.ts` builds one, throws `NTP clock skew detected` when the
// wall clock steps back between two ids, and the setup file's monotonic
// clock (spec/lib/monotonic-clock.ts) keeps it from doing so. Each case
// builds a fresh provider rather than using ids.ts's process-wide one.

function steppableClock() {
  let offset = 0
  return {
    now: () => realNow() + offset,
    stepBack: (ms: number) => { offset -= ms },
  }
}

describe('clock skew between two ids (I-0018)', () => {
  let savedNow: () => number

  beforeEach(() => {
    savedNow = Date.now
  })

  afterEach(() => {
    Date.now = savedNow
  })

  it('throws "NTP clock skew detected" when the raw clock steps back', () => {
    const nextId = getBase62Provider()
    const clock = steppableClock()
    Date.now = clock.now

    nextId()
    clock.stepBack(5_000)

    expect(() => nextId()).toThrow('NTP clock skew detected')
  })

  it('makes both ids when the clock is kept monotonic', () => {
    const nextId = getBase62Provider()
    const clock = steppableClock()
    Date.now = monotonic(clock.now)

    const first = nextId()
    clock.stepBack(5_000)
    const second = nextId()

    expect(second).not.toBe(first)
    expect(second > first).toBe(true)
  })
})

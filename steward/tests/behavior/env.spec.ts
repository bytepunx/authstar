import { afterEach, describe, expect, it } from 'vitest'
import { loadEnv, setSignetOverride, type StewardEnv } from '../../src/lib/server/env.js'

// ADR 0102 / Story 006: env.ts's Env-Only-Mode surface, and the override
// signet-config.ts installs in Signet-Configured Mode.

describe('loadEnv', () => {
  afterEach(() => {
    // signetOverride is module-scoped -- clear it after every test so cases
    // don't leak into each other.
    setSignetOverride(undefined)
  })

  it('defaults towerUrl to localhost:3000 when TOWER_URL is unset', () => {
    expect(loadEnv({})).toEqual({ towerUrl: 'http://localhost:3000' })
  })

  it('reads TOWER_URL from the given source', () => {
    expect(loadEnv({ TOWER_URL: 'http://tower.internal:9000' })).toEqual({ towerUrl: 'http://tower.internal:9000' })
  })

  it('does not expose a heraldUrl field -- HERALD_URL is dead config, removed per ADR 0102 / Story 006', () => {
    const env = loadEnv({ TOWER_URL: 'http://tower.internal:9000', HERALD_URL: 'http://herald.internal:3300' } as NodeJS.ProcessEnv)
    expect(env).toEqual({ towerUrl: 'http://tower.internal:9000' })
    expect('heraldUrl' in env).toBe(false)
  })

  it('a set signet override wins over both TOWER_URL and the default, with no way to opt back into env from the same process', () => {
    const override: StewardEnv = { towerUrl: 'http://tower-from-signet.internal:3000' }
    setSignetOverride(override)
    expect(loadEnv({ TOWER_URL: 'http://tower-from-env.internal:9000' })).toEqual(override)
    expect(loadEnv({})).toEqual(override)
  })

  it('clearing the override (setSignetOverride(undefined)) restores plain-env behavior', () => {
    setSignetOverride({ towerUrl: 'http://from-signet.internal' })
    setSignetOverride(undefined)
    expect(loadEnv({ TOWER_URL: 'http://from-env.internal' })).toEqual({ towerUrl: 'http://from-env.internal' })
  })
})

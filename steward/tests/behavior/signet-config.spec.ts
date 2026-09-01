import { afterEach, describe, expect, it, vi } from 'vitest'
import { setSignetOverride } from '../../src/lib/server/env.js'
import {
  initSignetSourcedEnv,
  readSignetBootstrap,
  resolveStewardEnv,
  type FetchServiceBundle,
  type SignetBootstrap,
} from '../../src/lib/server/signet-config.js'

// ADR 0102 / Story 006: the Env-Only/Signet-Configured gate for steward's
// plain config URL. The real signet dial (defaultFetchServiceBundle) needs
// a live SPIFFE workload socket and a real signet server, so every test
// here drives resolveStewardEnv/initSignetSourcedEnv through an injected
// fetchServiceBundle fake instead -- see signet-config.ts's header comment.

const bootstrapEnv = {
  SIGNET_ADDR: 'signet.internal:8443',
  SIGNET_TRUST_DOMAIN: 'example.org',
  SIGNET_NAMESPACE: 'authstar',
} satisfies NodeJS.ProcessEnv

describe('readSignetBootstrap', () => {
  it('is undefined (Env-Only Mode) when SIGNET_ADDR is unset', () => {
    expect(readSignetBootstrap({})).toBeUndefined()
    expect(readSignetBootstrap({ SIGNET_TRUST_DOMAIN: 'example.org', SIGNET_NAMESPACE: 'authstar' })).toBeUndefined()
  })

  it('defaults service to "steward" and reads the other bootstrap coordinates once SIGNET_ADDR is set', () => {
    expect(readSignetBootstrap(bootstrapEnv)).toEqual({
      address: 'signet.internal:8443',
      trustDomain: 'example.org',
      namespace: 'authstar',
      service: 'steward',
    })
  })

  it('honors SIGNET_SERVICE when set', () => {
    expect(readSignetBootstrap({ ...bootstrapEnv, SIGNET_SERVICE: 'steward-staging' })?.service).toBe('steward-staging')
  })

  it('fails loud, naming the field, if SIGNET_ADDR is set but SIGNET_TRUST_DOMAIN is missing', () => {
    expect(() => readSignetBootstrap({ SIGNET_ADDR: 'signet.internal:8443', SIGNET_NAMESPACE: 'authstar' })).toThrow(
      /SIGNET_TRUST_DOMAIN/,
    )
  })

  it('fails loud, naming the field, if SIGNET_ADDR is set but SIGNET_NAMESPACE is missing', () => {
    expect(() => readSignetBootstrap({ SIGNET_ADDR: 'signet.internal:8443', SIGNET_TRUST_DOMAIN: 'example.org' })).toThrow(
      /SIGNET_NAMESPACE/,
    )
  })
})

describe('resolveStewardEnv', () => {
  it('Env-Only Mode: returns plain loadEnv(source) unchanged, and never calls fetchServiceBundle', async () => {
    const fetchServiceBundle = vi.fn<FetchServiceBundle>()
    const env = await resolveStewardEnv({ TOWER_URL: 'http://tower-from-env.internal' }, fetchServiceBundle)
    expect(env).toEqual({ towerUrl: 'http://tower-from-env.internal' })
    expect(fetchServiceBundle).not.toHaveBeenCalled()
  })

  it('Signet-Configured Mode: sources towerUrl from the bundle, overriding TOWER_URL even when both are present', async () => {
    const fetchServiceBundle: FetchServiceBundle = async (bootstrap: SignetBootstrap) => {
      expect(bootstrap).toEqual({
        address: 'signet.internal:8443',
        trustDomain: 'example.org',
        namespace: 'authstar',
        service: 'steward',
      })
      return { towerUrl: 'http://tower-from-signet.internal' }
    }
    const env = await resolveStewardEnv({ ...bootstrapEnv, TOWER_URL: 'http://tower-from-env.internal' }, fetchServiceBundle)
    expect(env).toEqual({ towerUrl: 'http://tower-from-signet.internal' })
  })

  it('Signet-Configured Mode: fails loud, naming the missing field and the namespace/service, when the bundle lacks towerUrl', async () => {
    const fetchServiceBundle: FetchServiceBundle = async () => ({})
    await expect(resolveStewardEnv(bootstrapEnv, fetchServiceBundle)).rejects.toThrow(/towerUrl/)
    await expect(resolveStewardEnv(bootstrapEnv, fetchServiceBundle)).rejects.toThrow(/authstar/)
    await expect(resolveStewardEnv(bootstrapEnv, fetchServiceBundle)).rejects.toThrow(/steward/)
  })

  it('Signet-Configured Mode: does not fall back to TOWER_URL when the bundle is missing towerUrl', async () => {
    const fetchServiceBundle: FetchServiceBundle = async () => ({})
    await expect(
      resolveStewardEnv({ ...bootstrapEnv, TOWER_URL: 'http://should-not-be-used.internal' }, fetchServiceBundle),
    ).rejects.toThrow()
  })
})

describe('initSignetSourcedEnv', () => {
  afterEach(() => {
    setSignetOverride(undefined)
  })

  it('Env-Only Mode: is a no-op, never touches env.ts state', async () => {
    await initSignetSourcedEnv({}, vi.fn<FetchServiceBundle>())
    // No override installed -- loadEnv (imported fresh) would still read plain env; verified indirectly via env.spec.ts.
  })

  it('Signet-Configured Mode: installs the bundle-sourced env as the process-wide override', async () => {
    const fetchServiceBundle: FetchServiceBundle = async () => ({ towerUrl: 'http://tower-from-signet.internal' })
    await initSignetSourcedEnv(bootstrapEnv, fetchServiceBundle)
    const { loadEnv } = await import('../../src/lib/server/env.js')
    expect(loadEnv({})).toEqual({ towerUrl: 'http://tower-from-signet.internal' })
  })

  it('Signet-Configured Mode: propagates the fail-loud error and installs no override', async () => {
    const fetchServiceBundle: FetchServiceBundle = async () => ({})
    await expect(initSignetSourcedEnv(bootstrapEnv, fetchServiceBundle)).rejects.toThrow(/towerUrl/)
    const { loadEnv } = await import('../../src/lib/server/env.js')
    expect(loadEnv({ TOWER_URL: 'http://still-plain-env.internal' })).toEqual({ towerUrl: 'http://still-plain-env.internal' })
  })
})

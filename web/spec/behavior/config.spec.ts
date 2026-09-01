import { describe, expect, it, vi } from 'vitest'
import type { WorkloadConnection } from '@bytepunx/signet-client'
import { loadConfig, type LoadConfigDeps } from '../../src/lib/server/config'

// ADR 0102/Story 012: signet precedence for web's plain config URLs
// (`towerBaseUrl`, `keepBaseUrl`, `internalJwtJwksUrl`). `dial` and `env`
// are both faked here rather than exercised against a real signet -- same
// "fake the boundary, not the framework" shape this repo's other
// spec/behavior tests use for tower/keep clients (see
// spec/fixtures/fake-tower-client.ts).

function fakeDial(bundle: Record<string, unknown> | undefined, err?: Error): LoadConfigDeps['dial'] {
	const close = vi.fn()
	const getServiceBundle = vi.fn(
		(_req: unknown, cb: (err: Error | null, resp: { bundle?: Record<string, unknown> }) => void) => {
			if (err) cb(err, undefined as never)
			else cb(null, { bundle })
		},
	)
	return vi.fn(async () => ({ client: { getServiceBundle }, close }) as unknown as WorkloadConnection)
}

describe('loadConfig -- Env-Only Mode (SIGNET_ADDR unset)', () => {
	it('sources every field from env, preserving TOWER_BASE_URL\'s existing fallback', async () => {
		const config = await loadConfig({
			dial: fakeDial(undefined),
			env: {},
		})
		expect(config).toEqual({
			towerBaseUrl: 'http://tower.internal:3000',
			keepBaseUrl: 'http://keep.internal:3000',
			internalJwtJwksUrl: undefined,
		})
	})

	it('honors explicitly-set env values for all three fields', async () => {
		const config = await loadConfig({
			dial: fakeDial(undefined),
			env: {
				TOWER_BASE_URL: 'http://tower.example.com',
				KEEP_BASE_URL: 'http://keep.example.com',
				INTERNAL_JWT_JWKS_URL: 'http://fixture.example.com/.well-known/jwks.json',
			},
		})
		expect(config).toEqual({
			towerBaseUrl: 'http://tower.example.com',
			keepBaseUrl: 'http://keep.example.com',
			internalJwtJwksUrl: 'http://fixture.example.com/.well-known/jwks.json',
		})
	})

	it('never dials signet when SIGNET_ADDR is unset', async () => {
		const dial = fakeDial(undefined)
		await loadConfig({ dial, env: { TOWER_BASE_URL: 'http://tower.example.com' } })
		expect(dial).not.toHaveBeenCalled()
	})
})

describe('loadConfig -- Signet-Configured Mode (SIGNET_ADDR set)', () => {
	const bootstrapEnv = {
		SIGNET_ADDR: 'signet.internal:8443',
		SIGNET_NAMESPACE: 'authstar',
		SIGNET_TRUST_DOMAIN: 'authstar.internal',
	}

	it('sources all three fields exclusively from the bundle', async () => {
		const dial = fakeDial({
			towerBaseUrl: 'http://tower.signet.example.com',
			keepBaseUrl: 'http://keep.signet.example.com',
			internalJwtJwksUrl: 'http://signet.example.com/.well-known/jwks.json',
		})
		const config = await loadConfig({ dial, env: bootstrapEnv })
		expect(config).toEqual({
			towerBaseUrl: 'http://tower.signet.example.com',
			keepBaseUrl: 'http://keep.signet.example.com',
			internalJwtJwksUrl: 'http://signet.example.com/.well-known/jwks.json',
		})
	})

	it('ignores conflicting env values -- signet always wins, never merged', async () => {
		const dial = fakeDial({
			towerBaseUrl: 'http://tower.signet.example.com',
			keepBaseUrl: 'http://keep.signet.example.com',
			internalJwtJwksUrl: 'http://signet.example.com/.well-known/jwks.json',
		})
		const config = await loadConfig({
			dial,
			env: {
				...bootstrapEnv,
				TOWER_BASE_URL: 'http://should-be-ignored.example.com',
				KEEP_BASE_URL: 'http://should-be-ignored.example.com',
				INTERNAL_JWT_JWKS_URL: 'http://should-be-ignored.example.com/jwks.json',
			},
		})
		expect(config.towerBaseUrl).toBe('http://tower.signet.example.com')
		expect(config.keepBaseUrl).toBe('http://keep.signet.example.com')
		expect(config.internalJwtJwksUrl).toBe('http://signet.example.com/.well-known/jwks.json')
	})

	it('closes the workload connection after fetching the bundle', async () => {
		const dial = fakeDial({
			towerBaseUrl: 'http://tower.signet.example.com',
			keepBaseUrl: 'http://keep.signet.example.com',
			internalJwtJwksUrl: 'http://signet.example.com/.well-known/jwks.json',
		})
		await loadConfig({ dial, env: bootstrapEnv })
		const workload = await (dial as ReturnType<typeof vi.fn>).mock.results[0].value
		expect(workload.close).toHaveBeenCalled()
	})

	it.each(['towerBaseUrl', 'keepBaseUrl', 'internalJwtJwksUrl'] as const)(
		'fails loud, naming the missing field, when the bundle is missing %s',
		async (missingField) => {
			const bundle: Record<string, unknown> = {
				towerBaseUrl: 'http://tower.signet.example.com',
				keepBaseUrl: 'http://keep.signet.example.com',
				internalJwtJwksUrl: 'http://signet.example.com/.well-known/jwks.json',
			}
			delete bundle[missingField]
			await expect(loadConfig({ dial: fakeDial(bundle), env: bootstrapEnv })).rejects.toThrow(
				new RegExp(`missing required field "${missingField}"`),
			)
		},
	)

	it('does not fall back to env when the bundle is missing a field', async () => {
		const bundle = {
			towerBaseUrl: 'http://tower.signet.example.com',
			keepBaseUrl: 'http://keep.signet.example.com',
			// internalJwtJwksUrl deliberately omitted
		}
		await expect(
			loadConfig({
				dial: fakeDial(bundle),
				env: { ...bootstrapEnv, INTERNAL_JWT_JWKS_URL: 'http://should-not-be-used.example.com/jwks.json' },
			}),
		).rejects.toThrow(/missing required field "internalJwtJwksUrl"/)
	})

	it('requires SIGNET_NAMESPACE when SIGNET_ADDR is set', async () => {
		await expect(
			loadConfig({
				dial: fakeDial({}),
				env: { SIGNET_ADDR: 'signet.internal:8443', SIGNET_TRUST_DOMAIN: 'authstar.internal' },
			}),
		).rejects.toThrow(/SIGNET_NAMESPACE/)
	})

	it('requires SIGNET_TRUST_DOMAIN when SIGNET_ADDR is set', async () => {
		await expect(
			loadConfig({
				dial: fakeDial({}),
				env: { SIGNET_ADDR: 'signet.internal:8443', SIGNET_NAMESPACE: 'authstar' },
			}),
		).rejects.toThrow(/SIGNET_TRUST_DOMAIN/)
	})
})

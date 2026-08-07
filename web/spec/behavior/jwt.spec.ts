import { beforeAll, describe, expect, it } from 'vitest'
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet, type JWTVerifyGetKey, type JWK } from 'jose'
import { InvalidInternalJwtError, verifyInternalJwt } from '../../src/lib/server/jwt'

// Story 010's internal JWT contract, as `web` (an upstream service, in
// portcullis's own terms) must interpret it: baseline identity claims
// always present, role/permission claims only layered on for the `Allow`
// outcome, and `enrichment_status: "degraded"` meaning "treat as having no
// grants," never "unknown, so let it through."

describe('verifyInternalJwt', () => {
	let getKey: JWTVerifyGetKey
	let sign: (claims: Record<string, unknown>) => Promise<string>

	beforeAll(async () => {
		const { publicKey, privateKey } = await generateKeyPair('ES256')
		const jwk = (await exportJWK(publicKey)) as JWK
		jwk.kid = 'test-key'
		jwk.alg = 'ES256'
		getKey = createLocalJWKSet({ keys: [jwk] })
		sign = (claims) =>
			new SignJWT(claims)
				.setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
				.setExpirationTime('60s')
				.sign(privateKey)
	})

	it('decodes an "ok" token into a full session', async () => {
		const token = await sign({
			sub: 'idp:google:abc',
			accountId: 'account_1',
			roles: ['admin'],
			permissions: ['applications:manage', 'billing:read'],
			enrichment_status: 'ok',
			email: 'admin@acme.example.com',
		})

		const session = await verifyInternalJwt(token, getKey, 'acme')

		expect(session.sub).toBe('idp:google:abc')
		expect(session.accountId).toBe('account_1')
		expect(session.tenantSlug).toBe('acme')
		expect(session.permissions).toEqual(['applications:manage', 'billing:read'])
		expect(session.enrichmentStatus).toBe('ok')
	})

	it('collapses a "degraded" token to empty roles/permissions, never fabricating grants', async () => {
		const token = await sign({
			sub: 'idp:google:abc',
			// A degraded token from portcullis's own fail-open path never
			// carries accountId/roles/permissions in the first place, but even
			// if one somehow did, this app must not trust them.
			accountId: 'account_1',
			permissions: ['applications:manage'],
			enrichment_status: 'degraded',
		})

		const session = await verifyInternalJwt(token, getKey, 'acme')

		expect(session.enrichmentStatus).toBe('degraded')
		expect(session.permissions).toEqual([])
		expect(session.roles).toEqual([])
		expect(session.accountId).toBe('')
	})

	it('defaults enrichment_status to "ok" when absent (baseline identity-only claims never omit it in practice, but this must not crash if it does)', async () => {
		const token = await sign({ sub: 'idp:google:abc' })
		const session = await verifyInternalJwt(token, getKey, 'acme')
		expect(session.enrichmentStatus).toBe('ok')
		expect(session.permissions).toEqual([])
	})

	it('rejects a token missing the required sub claim', async () => {
		const token = await sign({ accountId: 'account_1' })
		await expect(verifyInternalJwt(token, getKey, 'acme')).rejects.toBeInstanceOf(InvalidInternalJwtError)
	})

	it('rejects an expired token', async () => {
		const { publicKey, privateKey } = await generateKeyPair('ES256')
		const jwk = (await exportJWK(publicKey)) as JWK
		jwk.kid = 'expired-key'
		jwk.alg = 'ES256'
		const expiredGetKey = createLocalJWKSet({ keys: [jwk] })
		const expiredToken = await new SignJWT({ sub: 'idp:google:abc' })
			.setProtectedHeader({ alg: 'ES256', kid: 'expired-key' })
			.setExpirationTime(Math.floor(Date.now() / 1000) - 10)
			.sign(privateKey)

		await expect(verifyInternalJwt(expiredToken, expiredGetKey, 'acme')).rejects.toBeInstanceOf(
			InvalidInternalJwtError,
		)
	})

	it('rejects a token signed by a key not in the JWKS', async () => {
		const { privateKey: otherPrivateKey } = await generateKeyPair('ES256')
		const forged = await new SignJWT({ sub: 'idp:google:abc' })
			.setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
			.setExpirationTime('60s')
			.sign(otherPrivateKey)

		await expect(verifyInternalJwt(forged, getKey, 'acme')).rejects.toBeInstanceOf(InvalidInternalJwtError)
	})
})

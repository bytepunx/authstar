import { beforeAll, describe, expect, it } from 'vitest'
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet, type JWTVerifyGetKey, type JWK } from 'jose'
import { InvalidInternalJwtError, verifyInternalJwt } from '../../src/lib/server/jwt'

// Story 010's internal JWT contract, as `web` (an upstream service, in
// portcullis's own terms) must interpret it: baseline identity claims
// always present, role/permission claims only layered on for the `Allow`
// outcome, and `enrichmentStatus: "degraded"` meaning "treat as having no
// grants," never "unknown, so let it through." Claim names/casing below
// match portcullis's actual InternalClaims struct (jwt/internal.rs) --
// camelCase `enrichmentStatus`, no separate `email` claim (`sub` is the
// email) -- not an earlier, unverified assumption about the wire shape.
// `tenant` lives on the protected *header*, not the payload (ADR 0089) --
// `verifyInternalJwt` (from @bytepunx/authstar-core) sources
// `session.tenantSlug` from there, verified, never from a request header.

describe('verifyInternalJwt', () => {
	let getKey: JWTVerifyGetKey
	let sign: (claims: Record<string, unknown>, header?: Record<string, unknown>) => Promise<string>

	beforeAll(async () => {
		const { publicKey, privateKey } = await generateKeyPair('ES256')
		const jwk = (await exportJWK(publicKey)) as JWK
		jwk.kid = 'test-key'
		jwk.alg = 'ES256'
		getKey = createLocalJWKSet({ keys: [jwk] })
		sign = (claims, header = {}) =>
			new SignJWT(claims)
				.setProtectedHeader({ alg: 'ES256', kid: 'test-key', tenant: 'acme', ...header })
				.setExpirationTime('60s')
				.sign(privateKey)
	})

	it('decodes an "ok" token into a full session', async () => {
		const token = await sign({
			sub: 'admin@acme.example.com',
			idp: 'dex',
			identityHash: 'abc123',
			accountId: 'account_1',
			roles: ['admin'],
			permissions: ['applications:manage', 'billing:read'],
			enrichmentStatus: 'ok',
		})

		const session = await verifyInternalJwt(token, getKey)

		expect(session.sub).toBe('admin@acme.example.com')
		expect(session.accountId).toBe('account_1')
		expect(session.tenantSlug).toBe('acme')
		expect(session.permissions).toEqual(['applications:manage', 'billing:read'])
		expect(session.enrichmentStatus).toBe('ok')
	})

	it('sources tenantSlug from the token\'s own protected header, not any request header', async () => {
		const token = await sign(
			{ sub: 'admin@other.example.com', idp: 'dex', identityHash: 'xyz789', enrichmentStatus: 'ok' },
			{ tenant: 'other-tenant' },
		)
		const session = await verifyInternalJwt(token, getKey)
		expect(session.tenantSlug).toBe('other-tenant')
	})

	it('derives email from sub -- portcullis has no separate email claim', async () => {
		const token = await sign({ sub: 'admin@acme.example.com', idp: 'dex', identityHash: 'abc123', enrichmentStatus: 'ok' })
		const session = await verifyInternalJwt(token, getKey)
		expect(session.email).toBe('admin@acme.example.com')
	})

	it('collapses a "degraded" token to empty roles/permissions, never fabricating grants', async () => {
		const token = await sign({
			sub: 'admin@acme.example.com',
			idp: 'dex',
			identityHash: 'abc123',
			// A degraded token from portcullis's own fail-open path never
			// carries accountId/roles/permissions in the first place, but even
			// if one somehow did, this app must not trust them.
			accountId: 'account_1',
			permissions: ['applications:manage'],
			enrichmentStatus: 'degraded',
		})

		const session = await verifyInternalJwt(token, getKey)

		expect(session.enrichmentStatus).toBe('degraded')
		expect(session.permissions).toEqual([])
		expect(session.roles).toEqual([])
		expect(session.accountId).toBe('')
	})

	it('rejects a token that merely spells the enrichment claim wrong, rather than silently treating it as "ok" (regression: this used to read enrichment_status and default to "ok")', async () => {
		const token = await sign({
			sub: 'admin@acme.example.com',
			idp: 'dex',
			identityHash: 'abc123',
			accountId: 'account_1',
			permissions: ['applications:manage'],
			enrichment_status: 'degraded', // wrong casing on purpose
		})

		// @bytepunx/authstar-core requires the correctly-cased claim outright
		// (missing-claim) rather than defaulting an absent/malformed one to
		// "ok" the way this app's old hand-rolled parsing used to -- a
		// stricter, fail-closed posture than the original regression test
		// checked for, but the same underlying guarantee: a wrong-cased field
		// is never silently read as if it granted "ok"/full trust.
		await expect(verifyInternalJwt(token, getKey)).rejects.toBeInstanceOf(InvalidInternalJwtError)
	})

	it('rejects a token with no enrichmentStatus claim at all, rather than defaulting to "ok" (a real portcullis-issued token never omits this required field)', async () => {
		const token = await sign({ sub: 'idp:google:abc', idp: 'dex', identityHash: 'abc123' })
		await expect(verifyInternalJwt(token, getKey)).rejects.toBeInstanceOf(InvalidInternalJwtError)
	})

	it('rejects a token missing the required sub claim', async () => {
		const token = await sign({ idp: 'dex', identityHash: 'abc123', accountId: 'account_1' })
		await expect(verifyInternalJwt(token, getKey)).rejects.toBeInstanceOf(InvalidInternalJwtError)
	})

	it('rejects a token missing the required idp/identityHash claims', async () => {
		const token = await sign({ sub: 'admin@acme.example.com' })
		await expect(verifyInternalJwt(token, getKey)).rejects.toBeInstanceOf(InvalidInternalJwtError)
	})

	it('rejects a token whose header is missing the tenant hint', async () => {
		const { publicKey, privateKey } = await generateKeyPair('ES256')
		const jwk = (await exportJWK(publicKey)) as JWK
		jwk.kid = 'no-tenant-key'
		jwk.alg = 'ES256'
		const noTenantGetKey = createLocalJWKSet({ keys: [jwk] })

		const missingTenant = await new SignJWT({ sub: 'admin@acme.example.com', idp: 'dex', identityHash: 'abc123' })
			.setProtectedHeader({ alg: 'ES256', kid: 'no-tenant-key' })
			.setExpirationTime('60s')
			.sign(privateKey)

		await expect(verifyInternalJwt(missingTenant, noTenantGetKey)).rejects.toBeInstanceOf(InvalidInternalJwtError)
	})

	it('rejects an expired token', async () => {
		const { publicKey, privateKey } = await generateKeyPair('ES256')
		const jwk = (await exportJWK(publicKey)) as JWK
		jwk.kid = 'expired-key'
		jwk.alg = 'ES256'
		const expiredGetKey = createLocalJWKSet({ keys: [jwk] })
		const expiredToken = await new SignJWT({ sub: 'idp:google:abc', idp: 'dex', identityHash: 'abc123' })
			.setProtectedHeader({ alg: 'ES256', kid: 'expired-key', tenant: 'acme' })
			.setExpirationTime(Math.floor(Date.now() / 1000) - 10)
			.sign(privateKey)

		await expect(verifyInternalJwt(expiredToken, expiredGetKey)).rejects.toBeInstanceOf(
			InvalidInternalJwtError,
		)
	})

	it('rejects a token signed by a key not in the JWKS', async () => {
		const { privateKey: otherPrivateKey } = await generateKeyPair('ES256')
		const forged = await new SignJWT({ sub: 'idp:google:abc', idp: 'dex', identityHash: 'abc123' })
			.setProtectedHeader({ alg: 'ES256', kid: 'test-key', tenant: 'acme' })
			.setExpirationTime('60s')
			.sign(otherPrivateKey)

		await expect(verifyInternalJwt(forged, getKey)).rejects.toBeInstanceOf(InvalidInternalJwtError)
	})
})

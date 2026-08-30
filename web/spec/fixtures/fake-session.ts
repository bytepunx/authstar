import type { Session } from '../../src/lib/server/session'

export function fakeSession(overrides: Partial<Session> = {}): Session {
	return {
		sub: 'idp:google:abc123',
		accountId: 'account_1',
		tenantSlug: 'acme',
		email: 'admin@acme.example.com',
		roles: ['admin'],
		permissions: ['applications:manage'],
		organizationMemberships: [],
		enrichmentStatus: 'ok',
		...overrides,
	}
}

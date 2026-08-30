import { vi } from 'vitest'
import {
	TowerNotFoundError,
	TowerRequestError,
	type AccountDetail,
	type ApiKeyCreateInput,
	type ApiKeyCreated,
	type ApiKeySummary,
	type ApplicationDetail,
	type ApplicationInput,
	type ApplicationUpdateInput,
	type Organization,
	type OrganizationInvite,
	type OrganizationMembership,
	type OrganizationRoleDefinition,
	type TowerClient,
} from '../../src/lib/server/clients/tower'

// The behavior tier's fake backend: an in-memory object satisfying
// `TowerClient` directly (no HTTP at all) -- per TESTING.md, this is what
// "backend calls faked" means for the contract tier. The integration tier
// (spec/integration) instead points the *real* HTTP-based client
// (src/lib/server/clients/tower.ts) at spec/fixtures/fake-tower-server.ts,
// a real server -- the two fixtures deliberately don't share code, since
// they're proving different things.

export interface FakeTowerClientOptions {
	applications?: ApplicationDetail[]
	providers?: { name: string; label: string }[]
	organizations?: Organization[]
	memberships?: OrganizationMembership[]
	roleCatalog?: OrganizationRoleDefinition[]
	accounts?: AccountDetail[]
	apiKeys?: ApiKeySummary[]
	/** Force every mutating call to fail as tower would reject it (409). */
	rejectMutations?: boolean
}

const DEFAULT_ORGANIZATION_ROLE_CATALOG: OrganizationRoleDefinition[] = [
	{ name: 'manager', scope: 'organization', status: 'active' },
	{ name: 'member', scope: 'organization', status: 'active' },
	{ name: 'billingAdmin', scope: 'organization', status: 'active' },
	{ name: 'billingViewer', scope: 'organization', status: 'active' },
]

export function createFakeTowerClient(options: FakeTowerClientOptions = {}) {
	const store = new Map<string, ApplicationDetail>()
	for (const app of options.applications ?? []) store.set(app.slug, app)
	const providers = options.providers ?? [
		{ name: 'google', label: 'Google' },
		{ name: 'github', label: 'GitHub' },
	]
	const organizations = new Map<string, Organization>()
	for (const org of options.organizations ?? []) organizations.set(org.organizationId, org)
	const memberships = new Map<string, OrganizationMembership>()
	for (const membership of options.memberships ?? []) memberships.set(membership.membershipId, membership)
	const roleCatalog = options.roleCatalog ?? DEFAULT_ORGANIZATION_ROLE_CATALOG
	const organizationInvites: OrganizationInvite[] = []
	const accounts = new Map<string, AccountDetail>()
	for (const account of options.accounts ?? []) accounts.set(account.accountId, account)
	const apiKeys = new Map<string, ApiKeySummary>()
	for (const key of options.apiKeys ?? []) apiKeys.set(key.apiKeyId, key)
	let apiKeyCounter = 0

	function membershipFor(organizationId: string, accountId: string): OrganizationMembership | undefined {
		return [...memberships.values()].find((m) => m.organizationId === organizationId && m.accountId === accountId)
	}

	const client: TowerClient = {
		listApplications: vi.fn(async () =>
			[...store.values()].map(({ slug, name, hosts, status }) => ({ slug, name, hosts, status })),
		),
		getApplication: vi.fn(async (_tenantSlug: string, slug: string) => {
			const app = store.get(slug)
			if (!app) throw new TowerNotFoundError(`no such application: ${slug}`)
			return app
		}),
		createApplication: vi.fn(async (_tenantSlug: string, input: ApplicationInput) => {
			if (options.rejectMutations) throw new TowerRequestError('rejected', 409)
			if (store.has(input.slug)) throw new TowerRequestError('slug exists', 409)
			const created: ApplicationDetail = {
				...input,
				status: 'active',
				publicUrl: `https://${input.primaryHost}`,
				loginUrl: `https://${input.primaryHost}/oauth2/select`,
				usageCredentials: [],
			}
			store.set(created.slug, created)
			return created
		}),
		updateApplication: vi.fn(async (_tenantSlug: string, slug: string, input: ApplicationUpdateInput) => {
			if (options.rejectMutations) throw new TowerRequestError('rejected', 409)
			const existing = store.get(slug)
			if (!existing) throw new TowerNotFoundError(`no such application: ${slug}`)
			const updated = { ...existing, ...input }
			store.set(slug, updated)
			return updated
		}),
		deleteApplication: vi.fn(async (_tenantSlug: string, slug: string) => {
			const existing = store.get(slug)
			if (!existing) throw new TowerNotFoundError(`no such application: ${slug}`)
			store.set(slug, { ...existing, status: 'deleted' })
		}),
		listProviders: vi.fn(async () => providers),
		issueUsageCredential: vi.fn(async (_tenantSlug: string, slug: string) => {
			const existing = store.get(slug)
			if (!existing) throw new TowerNotFoundError(`no such application: ${slug}`)
			const credentialId = `cred_${existing.usageCredentials.length + 1}`
			existing.usageCredentials.push({ credentialId, status: 'active', createdAt: '2026-01-01T00:00:00.000Z' })
			return { credentialId, secret: `secret_${credentialId}` }
		}),
		revokeUsageCredential: vi.fn(async (_tenantSlug: string, slug: string, credentialId: string) => {
			const existing = store.get(slug)
			const credential = existing?.usageCredentials.find((c) => c.credentialId === credentialId)
			if (!credential) throw new TowerNotFoundError('no such credential')
			credential.status = 'revoked'
		}),
		listOrganizations: vi.fn(async () => [...organizations.values()]),
		getOrganization: vi.fn(async (_tenantSlug: string, organizationId: string) => {
			const org = organizations.get(organizationId)
			if (!org) throw new TowerNotFoundError(`no such organization: ${organizationId}`)
			return org
		}),
		listOrganizationMembers: vi.fn(async (_tenantSlug: string, organizationId: string) =>
			[...memberships.values()].filter((m) => m.organizationId === organizationId),
		),
		listOrganizationRoleCatalog: vi.fn(async () => roleCatalog),
		grantOrganizationRole: vi.fn(async (_tenantSlug: string, organizationId: string, accountId: string, role: string) => {
			if (options.rejectMutations) throw new TowerRequestError('rejected', 409)
			const membership = membershipFor(organizationId, accountId)
			if (!membership) throw new TowerNotFoundError(`account is not a member of this organization: ${accountId}`)
			if (!membership.roles.includes(role)) membership.roles = [...membership.roles, role]
			return membership
		}),
		revokeOrganizationRole: vi.fn(async (_tenantSlug: string, organizationId: string, accountId: string, role: string) => {
			if (options.rejectMutations) throw new TowerRequestError('rejected', 409)
			const membership = membershipFor(organizationId, accountId)
			if (!membership) throw new TowerNotFoundError(`account is not a member of this organization: ${accountId}`)
			membership.roles = membership.roles.filter((r) => r !== role)
			return membership
		}),
		removeOrganizationMember: vi.fn(async (_tenantSlug: string, organizationId: string, accountId: string) => {
			if (options.rejectMutations) throw new TowerRequestError('rejected', 409)
			const membership = membershipFor(organizationId, accountId)
			if (!membership) throw new TowerNotFoundError(`account is not a member of this organization: ${accountId}`)
			memberships.delete(membership.membershipId)
		}),
		setOrganizationSuccessor: vi.fn(async (_tenantSlug: string, organizationId: string, accountId: string, successorAccountId: string) => {
			if (options.rejectMutations) throw new TowerRequestError('rejected', 409)
			const membership = membershipFor(organizationId, accountId)
			if (!membership) throw new TowerNotFoundError(`account is not a member of this organization: ${accountId}`)
			membership.successorAccountId = successorAccountId
			return membership
		}),
		clearOrganizationSuccessor: vi.fn(async (_tenantSlug: string, organizationId: string, accountId: string) => {
			if (options.rejectMutations) throw new TowerRequestError('rejected', 409)
			const membership = membershipFor(organizationId, accountId)
			if (!membership) throw new TowerNotFoundError(`account is not a member of this organization: ${accountId}`)
			membership.successorAccountId = null
			return membership
		}),
		createOrganizationInvite: vi.fn(
			async (
				tenantSlug: string,
				organizationId: string,
				input: { contactId?: string; email?: string; organizationRole: string; expiresAt?: string | null },
			) => {
				if (options.rejectMutations) throw new TowerRequestError('rejected', 409)
				const invite: OrganizationInvite = {
					token: `invite_${organizationInvites.length + 1}`,
					tenant: tenantSlug,
					contactId: input.contactId ?? `contact-for-${input.email}`,
					organizationId,
					organizationRole: input.organizationRole,
					status: 'pending',
					createdAt: '2026-01-01T00:00:00.000Z',
					expiresAt: input.expiresAt ?? null,
				}
				organizationInvites.push(invite)
				return invite
			},
		),
		getAccount: vi.fn(async (_tenantSlug: string, accountId: string) => {
			const account = accounts.get(accountId)
			if (!account) throw new TowerNotFoundError(`no such account: ${accountId}`)
			return account
		}),
		createPersonalApiKey: vi.fn(async (tenantSlug: string, appSlug: string, input: ApiKeyCreateInput) => {
			if (options.rejectMutations) throw new TowerRequestError('rejected', 409)
			apiKeyCounter += 1
			const apiKeyId = `apikey-${apiKeyCounter}`
			const created: ApiKeyCreated = {
				apiKeyId,
				tenant: tenantSlug,
				application: appSlug,
				name: input.name,
				owner: { account: 'acct-1' },
				grantedRoles: input.grantedRoles,
				createdBy: 'acct-1',
				secretPreview: 'abcd',
				status: 'active',
				createdAt: '2026-01-01T00:00:00.000Z',
				secret: `authstar_${apiKeyId}_fakeSecret`,
			}
			apiKeys.set(apiKeyId, created)
			return created
		}),
		listPersonalApiKeys: vi.fn(async (_tenantSlug: string, appSlug: string) =>
			[...apiKeys.values()].filter((k) => k.application === appSlug && 'account' in k.owner),
		),
		revokePersonalApiKey: vi.fn(async (_tenantSlug: string, _appSlug: string, apiKeyId: string) => {
			const existing = apiKeys.get(apiKeyId)
			if (!existing) throw new TowerNotFoundError(`no such api key: ${apiKeyId}`)
			apiKeys.set(apiKeyId, { ...existing, status: 'revoked' })
		}),
		createOrganizationApiKey: vi.fn(async (tenantSlug: string, organizationId: string, appSlug: string, input: ApiKeyCreateInput) => {
			if (options.rejectMutations) throw new TowerRequestError('rejected', 409)
			apiKeyCounter += 1
			const apiKeyId = `apikey-${apiKeyCounter}`
			const created: ApiKeyCreated = {
				apiKeyId,
				tenant: tenantSlug,
				application: appSlug,
				name: input.name,
				owner: { organization: organizationId },
				grantedRoles: input.grantedRoles,
				createdBy: 'acct-1',
				secretPreview: 'abcd',
				status: 'active',
				createdAt: '2026-01-01T00:00:00.000Z',
				secret: `authstar_${apiKeyId}_fakeSecret`,
			}
			apiKeys.set(apiKeyId, created)
			return created
		}),
		listOrganizationApiKeys: vi.fn(async (_tenantSlug: string, organizationId: string, appSlug: string) =>
			[...apiKeys.values()].filter((k) => k.application === appSlug && 'organization' in k.owner && k.owner.organization === organizationId),
		),
		revokeOrganizationApiKey: vi.fn(async (_tenantSlug: string, _organizationId: string, _appSlug: string, apiKeyId: string) => {
			const existing = apiKeys.get(apiKeyId)
			if (!existing) throw new TowerNotFoundError(`no such api key: ${apiKeyId}`)
			apiKeys.set(apiKeyId, { ...existing, status: 'revoked' })
		}),
	}

	return client
}

export function fakeOrganization(overrides: Partial<Organization> = {}): Organization {
	return {
		organizationId: 'org-1',
		tenant: 'acme',
		name: 'Acme Corp',
		grantedRoles: [],
		seatLimit: null,
		apiKeyLimit: null,
		apiKeyRateLimit: null,
		...overrides,
	}
}

export function fakeAccount(overrides: Partial<AccountDetail> = {}): AccountDetail {
	return {
		accountId: 'acct-1',
		tenant: 'acme',
		status: 'active',
		grantedRoles: [],
		apiKeyLimit: null,
		apiKeyRateLimit: null,
		...overrides,
	}
}

export function fakeApiKey(overrides: Partial<ApiKeySummary> = {}): ApiKeySummary {
	return {
		apiKeyId: 'apikey-1',
		tenant: 'acme',
		application: 'widgetco',
		name: 'ci key',
		owner: { account: 'acct-1' },
		grantedRoles: [],
		createdBy: 'acct-1',
		secretPreview: 'abcd',
		status: 'active',
		createdAt: '2026-01-01T00:00:00.000Z',
		...overrides,
	}
}

export function fakeMembership(overrides: Partial<OrganizationMembership> = {}): OrganizationMembership {
	return {
		membershipId: 'membership-1',
		tenant: 'acme',
		accountId: 'acct-1',
		organizationId: 'org-1',
		roles: ['manager', 'member'],
		successorAccountId: null,
		...overrides,
	}
}

export function fakeApplication(overrides: Partial<ApplicationDetail> = {}): ApplicationDetail {
	return {
		slug: 'widgetco',
		name: 'Widget Co',
		status: 'active',
		hosts: ['widgetco.acme.example.com'],
		primaryHost: 'widgetco.acme.example.com',
		publicUrl: 'https://widgetco.acme.example.com',
		upstream: { baseUrl: 'http://widgetco.internal:8080', prefixRoutes: [], timeout: 30 },
		cors: { allowedOrigins: [] },
		exemptPaths: [],
		loginUrl: 'https://widgetco.acme.example.com/oauth2/select',
		exposedProviders: ['google'],
		usageCredentials: [],
		...overrides,
	}
}

import { vi } from 'vitest'
import {
	TowerNotFoundError,
	TowerRequestError,
	type AccountSummary,
	type ApplicationDetail,
	type ApplicationInput,
	type ApplicationUpdateInput,
	type Organization,
	type OrganizationInvite,
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
	accounts?: AccountSummary[]
	/** Force every mutating call to fail as tower would reject it (409). */
	rejectMutations?: boolean
}

export function createFakeTowerClient(options: FakeTowerClientOptions = {}) {
	const store = new Map<string, ApplicationDetail>()
	for (const app of options.applications ?? []) store.set(app.slug, app)
	const providers = options.providers ?? [
		{ name: 'google', label: 'Google' },
		{ name: 'github', label: 'GitHub' },
	]
	const organizations = new Map<string, Organization>()
	for (const org of options.organizations ?? []) organizations.set(org.organizationId, org)
	const accounts = new Map<string, AccountSummary>()
	for (const account of options.accounts ?? []) accounts.set(account.accountId, account)
	const organizationInvites: OrganizationInvite[] = []

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
			[...accounts.values()].filter((a) => a.organizationId === organizationId),
		),
		addOrganizationManager: vi.fn(async (_tenantSlug: string, organizationId: string, accountId: string) => {
			if (options.rejectMutations) throw new TowerRequestError('rejected', 409)
			const org = organizations.get(organizationId)
			if (!org) throw new TowerNotFoundError(`no such organization: ${organizationId}`)
			if (!org.managers.includes(accountId)) org.managers = [...org.managers, accountId]
			return org
		}),
		removeOrganizationManager: vi.fn(async (_tenantSlug: string, organizationId: string, accountId: string) => {
			if (options.rejectMutations) throw new TowerRequestError('rejected', 409)
			const org = organizations.get(organizationId)
			if (!org) throw new TowerNotFoundError(`no such organization: ${organizationId}`)
			org.managers = org.managers.filter((m) => m !== accountId)
			return org
		}),
		removeOrganizationMember: vi.fn(async (_tenantSlug: string, organizationId: string, accountId: string) => {
			if (options.rejectMutations) throw new TowerRequestError('rejected', 409)
			const org = organizations.get(organizationId)
			if (!org) throw new TowerNotFoundError(`no such organization: ${organizationId}`)
			org.managers = org.managers.filter((m) => m !== accountId)
			const account = accounts.get(accountId)
			if (account) account.organizationId = null
		}),
		grantBillingAccess: vi.fn(async (_tenantSlug: string, organizationId: string, accountId: string) => {
			if (options.rejectMutations) throw new TowerRequestError('rejected', 409)
			const org = organizations.get(organizationId)
			if (!org) throw new TowerNotFoundError(`no such organization: ${organizationId}`)
			const account = accounts.get(accountId)
			if (!account || account.organizationId !== organizationId) throw new TowerNotFoundError(`account is not a member of this organization: ${accountId}`)
		}),
		revokeBillingAccess: vi.fn(async (_tenantSlug: string, organizationId: string, accountId: string) => {
			if (options.rejectMutations) throw new TowerRequestError('rejected', 409)
			const org = organizations.get(organizationId)
			if (!org) throw new TowerNotFoundError(`no such organization: ${organizationId}`)
			const account = accounts.get(accountId)
			if (!account || account.organizationId !== organizationId) throw new TowerNotFoundError(`account is not a member of this organization: ${accountId}`)
		}),
		createOrganizationInvite: vi.fn(
			async (
				tenantSlug: string,
				organizationId: string,
				input: { contactId: string; organizationRole: 'member' | 'manager'; expiresAt?: string | null },
			) => {
				if (options.rejectMutations) throw new TowerRequestError('rejected', 409)
				const invite: OrganizationInvite = {
					token: `invite_${organizationInvites.length + 1}`,
					tenant: tenantSlug,
					contactId: input.contactId,
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
	}

	return client
}

export function fakeOrganization(overrides: Partial<Organization> = {}): Organization {
	return {
		organizationId: 'org-1',
		tenant: 'acme',
		name: 'Acme Corp',
		managers: ['acct-1'],
		successors: {},
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

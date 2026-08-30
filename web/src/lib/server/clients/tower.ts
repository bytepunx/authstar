// Server-side tower client -- every call `_admin`'s Applications screens
// (Story 003) make against tower's application routes (tower Story 004),
// forwarding the same internal JWT the request itself carried, per Story
// 001 ("`web` calls tower ... exclusively server-side ... using the
// forwarded internal JWT"). Injected onto `event.locals.clients.tower` in
// hooks.server.ts (real HTTP) so route code never imports this factory
// directly -- behavior-tier tests substitute a fake object satisfying this
// same interface instead, integration-tier tests point `baseUrl` at a real
// (fake) HTTP server and exercise this file's actual fetch/parsing code.

export interface ApplicationSummary {
	slug: string
	name: string
	hosts: string[]
	status: 'active' | 'suspended' | 'deleted'
}

export interface UsageCredentialSummary {
	credentialId: string
	status: 'active' | 'revoked'
	createdAt: string
}

export interface ApplicationDetail {
	slug: string
	name: string
	status: 'active' | 'suspended' | 'deleted'
	hosts: string[]
	primaryHost: string
	publicUrl: string
	upstream: {
		baseUrl: string
		prefixRoutes: string[]
		timeout: number
	}
	cors: {
		allowedOrigins: string[]
	}
	exemptPaths: string[]
	loginUrl: string
	exposedProviders: string[]
	usageCredentials: UsageCredentialSummary[]
}

export interface ApplicationInput {
	slug: string
	name: string
	hosts: string[]
	primaryHost: string
	upstream: {
		baseUrl: string
		prefixRoutes: string[]
		timeout: number
	}
	cors: {
		allowedOrigins: string[]
	}
	exemptPaths: string[]
	exposedProviders: string[]
}

export interface ApplicationUpdateInput {
	name?: string
	hosts?: string[]
	primaryHost?: string
	upstream?: {
		baseUrl: string
		prefixRoutes: string[]
		timeout: number
	}
	cors?: {
		allowedOrigins: string[]
	}
	exemptPaths?: string[]
	exposedProviders?: string[]
	status?: 'active' | 'suspended' | 'deleted'
}

// ADR 0100 (design/decisions/0100-organization-membership-and-open-role-
// catalog.md, supersedes ADR 0090). `grantedRoles`/`seatLimit` are
// populated only by keep's entitlement events, never by any route here
// directly -- read-only in this client, same as tower itself treats them.
export interface Organization {
	organizationId: string
	tenant: string
	name: string
	grantedRoles: Array<{ application: string; role: string }>
	seatLimit: number | null
}

// One (account, organization) membership record -- the roster
// `listOrganizationMembers` returns. `roles` is the open, catalog-
// validated org-role vocabulary (`listOrganizationRoleCatalog`), always
// including 'member'; `successorAccountId` is only meaningful while
// 'manager' is among `roles`, and is self-service-only in tower (no
// tenant-admin override -- "a manager cannot set another manager's
// successor" -- this admin surface can view who's designated, never
// change it).
export interface OrganizationMembership {
	membershipId: string
	tenant: string
	accountId: string
	organizationId: string
	roles: string[]
	successorAccountId: string | null
}

export interface OrganizationRoleDefinition {
	name: string
	scope: 'organization'
	status: 'active' | 'retired'
	description?: string
}

export interface OrganizationInvite {
	token: string
	tenant: string
	contactId: string
	organizationId: string | null
	organizationRole: string | null
	status: 'pending' | 'accepted' | 'revoked' | 'expired'
	createdAt: string
	expiresAt: string | null
}

export class TowerRequestError extends Error {
	constructor(
		message: string,
		public readonly status: number,
		public readonly body?: unknown,
	) {
		super(message)
	}
}

export class TowerNotFoundError extends Error {}

export interface TowerClient {
	listApplications(tenantSlug: string): Promise<ApplicationSummary[]>
	getApplication(tenantSlug: string, slug: string): Promise<ApplicationDetail>
	createApplication(tenantSlug: string, input: ApplicationInput): Promise<ApplicationDetail>
	updateApplication(tenantSlug: string, slug: string, input: ApplicationUpdateInput): Promise<ApplicationDetail>
	deleteApplication(tenantSlug: string, slug: string): Promise<void>
	listProviders(tenantSlug: string): Promise<{ name: string; label: string }[]>
	issueUsageCredential(tenantSlug: string, slug: string): Promise<{ credentialId: string; secret: string }>
	revokeUsageCredential(tenantSlug: string, slug: string, credentialId: string): Promise<void>
	listOrganizations(tenantSlug: string): Promise<Organization[]>
	getOrganization(tenantSlug: string, organizationId: string): Promise<Organization>
	listOrganizationMembers(tenantSlug: string, organizationId: string): Promise<OrganizationMembership[]>
	listOrganizationRoleCatalog(tenantSlug: string): Promise<OrganizationRoleDefinition[]>
	grantOrganizationRole(tenantSlug: string, organizationId: string, accountId: string, role: string): Promise<OrganizationMembership>
	revokeOrganizationRole(tenantSlug: string, organizationId: string, accountId: string, role: string): Promise<OrganizationMembership>
	removeOrganizationMember(tenantSlug: string, organizationId: string, accountId: string): Promise<void>
	setOrganizationSuccessor(tenantSlug: string, organizationId: string, accountId: string, successorAccountId: string): Promise<OrganizationMembership>
	clearOrganizationSuccessor(tenantSlug: string, organizationId: string, accountId: string): Promise<OrganizationMembership>
	createOrganizationInvite(
		tenantSlug: string,
		organizationId: string,
		input: { contactId?: string; email?: string; organizationRole: string; expiresAt?: string | null },
	): Promise<OrganizationInvite>
}

export interface CreateTowerClientOptions {
	baseUrl: string
	authorization: string | null
	fetch: typeof globalThis.fetch
}

export function createTowerClient(options: CreateTowerClientOptions): TowerClient {
	const { baseUrl, authorization, fetch: fetchImpl } = options

	async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
		const response = await fetchImpl(`${baseUrl}${path}`, {
			method,
			headers: {
				'content-type': 'application/json',
				...(authorization ? { authorization: `Bearer ${authorization}` } : {}),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		})

		if (response.status === 404) {
			throw new TowerNotFoundError(`tower: ${method} ${path} -> 404`)
		}
		if (!response.ok) {
			let parsedBody: unknown
			try {
				parsedBody = await response.json()
			} catch {
				parsedBody = undefined
			}
			throw new TowerRequestError(`tower: ${method} ${path} -> ${response.status}`, response.status, parsedBody)
		}
		if (response.status === 204) {
			return undefined as T
		}
		return (await response.json()) as T
	}

	return {
		listApplications(tenantSlug) {
			return request('GET', `/tenants/${tenantSlug}/applications`)
		},
		getApplication(tenantSlug, slug) {
			return request('GET', `/tenants/${tenantSlug}/applications/${slug}`)
		},
		createApplication(tenantSlug, input) {
			return request('POST', `/tenants/${tenantSlug}/applications`, input)
		},
		updateApplication(tenantSlug, slug, input) {
			return request('PATCH', `/tenants/${tenantSlug}/applications/${slug}`, input)
		},
		async deleteApplication(tenantSlug, slug) {
			await request('DELETE', `/tenants/${tenantSlug}/applications/${slug}`)
		},
		listProviders(tenantSlug) {
			return request('GET', `/tenants/${tenantSlug}/providers`)
		},
		issueUsageCredential(tenantSlug, slug) {
			return request('POST', `/tenants/${tenantSlug}/applications/${slug}/usage-credentials`)
		},
		async revokeUsageCredential(tenantSlug, slug, credentialId) {
			await request('DELETE', `/tenants/${tenantSlug}/applications/${slug}/usage-credentials/${credentialId}`)
		},
		listOrganizations(tenantSlug) {
			return request('GET', `/tenants/${tenantSlug}/organizations`)
		},
		getOrganization(tenantSlug, organizationId) {
			return request('GET', `/tenants/${tenantSlug}/organizations/${organizationId}`)
		},
		listOrganizationMembers(tenantSlug, organizationId) {
			return request('GET', `/tenants/${tenantSlug}/organizations/${organizationId}/members`)
		},
		listOrganizationRoleCatalog(tenantSlug) {
			return request('GET', `/tenants/${tenantSlug}/role-definitions?scope=organization&status=active`)
		},
		grantOrganizationRole(tenantSlug, organizationId, accountId, role) {
			return request('POST', `/tenants/${tenantSlug}/organizations/${organizationId}/members/${accountId}/roles`, { role })
		},
		revokeOrganizationRole(tenantSlug, organizationId, accountId, role) {
			return request('DELETE', `/tenants/${tenantSlug}/organizations/${organizationId}/members/${accountId}/roles/${encodeURIComponent(role)}`)
		},
		async removeOrganizationMember(tenantSlug, organizationId, accountId) {
			await request('DELETE', `/tenants/${tenantSlug}/organizations/${organizationId}/members/${accountId}`)
		},
		setOrganizationSuccessor(tenantSlug, organizationId, accountId, successorAccountId) {
			return request('PUT', `/tenants/${tenantSlug}/organizations/${organizationId}/members/${accountId}/successor`, { successorAccountId })
		},
		clearOrganizationSuccessor(tenantSlug, organizationId, accountId) {
			return request('DELETE', `/tenants/${tenantSlug}/organizations/${organizationId}/members/${accountId}/successor`)
		},
		createOrganizationInvite(tenantSlug, organizationId, input) {
			return request('POST', `/tenants/${tenantSlug}/organizations/${organizationId}/invites`, input)
		},
	}
}

// Server-side keep client -- mirrors clients/tower.ts's own conventions
// exactly (Story 001: "web calls tower/keep exclusively server-side ...
// using the forwarded internal JWT"). The one property this whole file
// exists to support: bytepunx/authstar-tower#3's original motivating gap
// (no path from a logged-in tenant admin's session to keep's billing API at
// all) -- keep has no operator-token bypass anywhere, by design (a
// deliberate choice for money-touching routes, unlike tower's more general
// admin surface), so this internal-JWT-forwarding path is the only
// supported way in.

export interface GrantedRole {
	application: string
	role: string
}

// design/adrs/0101-api-keys.md.
export interface ApiKeyRateLimit {
	requestsPerMinute: number
	burst?: number
}

export interface PlanMapping {
	id: string
	tenant: string
	stripePriceId: string
	name: string
	seatLimit: number | null
	grantedRoles: GrantedRole[]
	meter: string | null
	apiKeyLimit: number | null
	apiKeyRateLimit: ApiKeyRateLimit | null
	unitAmount: number | null
	currency: string
	interval: 'month' | 'year'
	status: 'active' | 'retired'
}

export interface PlanMappingInput {
	stripePriceId: string
	name: string
	seatLimit?: number | null
	grantedRoles?: GrantedRole[]
	meter?: string | null
	apiKeyLimit?: number | null
	apiKeyRateLimit?: ApiKeyRateLimit | null
}

// stripePriceId (and the unitAmount/currency/interval keep resolves from it
// at creation) is deliberately absent here -- it's the mapping's own
// identity, not an editable field; retire and create a new mapping to
// change which Stripe price is involved.
export interface PlanMappingUpdate {
	name?: string
	seatLimit?: number | null
	grantedRoles?: GrantedRole[]
	meter?: string | null
	apiKeyLimit?: number | null
	apiKeyRateLimit?: ApiKeyRateLimit | null
}

export interface StripeConfigStatus {
	configured: boolean
}

export interface StripeConfigInput {
	secretKey: string
	webhookSecret: string
}

export class KeepRequestError extends Error {
	constructor(
		message: string,
		public readonly status: number,
		public readonly body?: unknown,
	) {
		super(message)
	}
}

export class KeepNotFoundError extends Error {}

export interface KeepClient {
	getStripeConfig(tenantSlug: string): Promise<StripeConfigStatus | null>
	setStripeConfig(tenantSlug: string, input: StripeConfigInput): Promise<StripeConfigStatus>
	listPlanMappings(tenantSlug: string, status?: 'active' | 'retired' | 'all'): Promise<PlanMapping[]>
	getPlanMapping(tenantSlug: string, id: string): Promise<PlanMapping | null>
	createPlanMapping(tenantSlug: string, input: PlanMappingInput): Promise<PlanMapping>
	updatePlanMapping(tenantSlug: string, id: string, input: PlanMappingUpdate): Promise<PlanMapping>
	retirePlanMapping(tenantSlug: string, id: string): Promise<PlanMapping>
}

export interface CreateKeepClientOptions {
	baseUrl: string
	authorization: string | null
	fetch: typeof globalThis.fetch
}

export function createKeepClient(options: CreateKeepClientOptions): KeepClient {
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
			throw new KeepNotFoundError(`keep: ${method} ${path} -> 404`)
		}
		if (!response.ok) {
			let parsedBody: unknown
			try {
				parsedBody = await response.json()
			} catch {
				parsedBody = undefined
			}
			throw new KeepRequestError(`keep: ${method} ${path} -> ${response.status}`, response.status, parsedBody)
		}
		if (response.status === 204) {
			return undefined as T
		}
		return (await response.json()) as T
	}

	return {
		async getStripeConfig(tenantSlug) {
			try {
				return await request<StripeConfigStatus>('GET', `/tenants/${tenantSlug}/stripe-config`)
			} catch (err) {
				if (err instanceof KeepNotFoundError) return null
				throw err
			}
		},
		setStripeConfig(tenantSlug, input) {
			return request('PATCH', `/tenants/${tenantSlug}/stripe-config`, input)
		},
		listPlanMappings(tenantSlug, status) {
			const query = status ? `?status=${status}` : ''
			return request('GET', `/tenants/${tenantSlug}/plan-mappings${query}`)
		},
		async getPlanMapping(tenantSlug, id) {
			try {
				return await request<PlanMapping>('GET', `/tenants/${tenantSlug}/plan-mappings/${id}`)
			} catch (err) {
				if (err instanceof KeepNotFoundError) return null
				throw err
			}
		},
		createPlanMapping(tenantSlug, input) {
			return request('POST', `/tenants/${tenantSlug}/plan-mappings`, input)
		},
		updatePlanMapping(tenantSlug, id, input) {
			return request('PATCH', `/tenants/${tenantSlug}/plan-mappings/${id}`, input)
		},
		async retirePlanMapping(tenantSlug, id) {
			return request('DELETE', `/tenants/${tenantSlug}/plan-mappings/${id}`)
		},
	}
}

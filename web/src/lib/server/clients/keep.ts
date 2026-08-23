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

export interface PlanMapping {
	id: string
	tenant: string
	stripePriceId: string
	name: string
	seatLimit: number | null
	grantedRoles: GrantedRole[]
	meter: string | null
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
	createPlanMapping(tenantSlug: string, input: PlanMappingInput): Promise<PlanMapping>
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
		createPlanMapping(tenantSlug, input) {
			return request('POST', `/tenants/${tenantSlug}/plan-mappings`, input)
		},
		async retirePlanMapping(tenantSlug, id) {
			return request('DELETE', `/tenants/${tenantSlug}/plan-mappings/${id}`)
		},
	}
}

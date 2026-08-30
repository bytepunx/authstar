import { vi } from 'vitest'
import {
	KeepNotFoundError,
	KeepRequestError,
	type KeepClient,
	type PlanMapping,
	type PlanMappingInput,
	type PlanMappingUpdate,
	type StripeConfigInput,
} from '../../src/lib/server/clients/keep'

// Mirrors fake-tower-client.ts's own conventions exactly -- an in-memory
// object satisfying `KeepClient` directly, no HTTP at all (per TESTING.md,
// this is what "backend calls faked" means for the behavior tier).

export interface FakeKeepClientOptions {
	stripeConfigured?: boolean
	planMappings?: PlanMapping[]
	/** Force every mutating call to fail as keep would reject it (409). */
	rejectMutations?: boolean
}

export function createFakeKeepClient(options: FakeKeepClientOptions = {}) {
	let configured = options.stripeConfigured ?? false
	const mappings = new Map<string, PlanMapping>()
	for (const m of options.planMappings ?? []) mappings.set(m.id, m)
	let nextId = mappings.size + 1

	const client: KeepClient = {
		getStripeConfig: vi.fn(async () => (configured ? { configured: true } : null)),
		setStripeConfig: vi.fn(async (_tenantSlug: string, _input: StripeConfigInput) => {
			if (options.rejectMutations) throw new KeepRequestError('rejected', 400)
			configured = true
			return { configured: true }
		}),
		listPlanMappings: vi.fn(async (_tenantSlug: string, status?: 'active' | 'retired' | 'all') => {
			const all = [...mappings.values()]
			const filterStatus = status ?? 'active'
			return filterStatus === 'all' ? all : all.filter((m) => m.status === filterStatus)
		}),
		createPlanMapping: vi.fn(async (tenantSlug: string, input: PlanMappingInput) => {
			if (options.rejectMutations) throw new KeepRequestError('rejected', 409)
			const created: PlanMapping = {
				id: `pm_${nextId++}`,
				tenant: tenantSlug,
				stripePriceId: input.stripePriceId,
				name: input.name,
				seatLimit: input.seatLimit ?? null,
				grantedRoles: input.grantedRoles ?? [],
				meter: input.meter ?? null,
				apiKeyLimit: input.apiKeyLimit ?? null,
				apiKeyRateLimit: input.apiKeyRateLimit ?? null,
				unitAmount: 1000,
				currency: 'usd',
				interval: 'month',
				status: 'active',
			}
			mappings.set(created.id, created)
			return created
		}),
		getPlanMapping: vi.fn(async (_tenantSlug: string, id: string) => mappings.get(id) ?? null),
		updatePlanMapping: vi.fn(async (_tenantSlug: string, id: string, input: PlanMappingUpdate) => {
			if (options.rejectMutations) throw new KeepRequestError('rejected', 409)
			const existing = mappings.get(id)
			if (!existing) throw new KeepNotFoundError(`no such plan mapping: ${id}`)
			const updated: PlanMapping = {
				...existing,
				...(input.name !== undefined ? { name: input.name } : {}),
				...(input.seatLimit !== undefined ? { seatLimit: input.seatLimit } : {}),
				...(input.grantedRoles !== undefined ? { grantedRoles: input.grantedRoles } : {}),
				...(input.meter !== undefined ? { meter: input.meter } : {}),
				...(input.apiKeyLimit !== undefined ? { apiKeyLimit: input.apiKeyLimit } : {}),
				...(input.apiKeyRateLimit !== undefined ? { apiKeyRateLimit: input.apiKeyRateLimit } : {}),
			}
			mappings.set(id, updated)
			return updated
		}),
		retirePlanMapping: vi.fn(async (_tenantSlug: string, id: string) => {
			const existing = mappings.get(id)
			if (!existing) throw new KeepNotFoundError(`no such plan mapping: ${id}`)
			const updated: PlanMapping = { ...existing, status: 'retired' }
			mappings.set(id, updated)
			return updated
		}),
	}

	return client
}

export function fakePlanMapping(overrides: Partial<PlanMapping> = {}): PlanMapping {
	return {
		id: 'pm_1',
		tenant: 'acme',
		stripePriceId: 'price_basic',
		name: 'Basic',
		seatLimit: null,
		grantedRoles: [{ application: 'demo-app', role: 'member' }],
		meter: null,
		apiKeyLimit: null,
		apiKeyRateLimit: null,
		unitAmount: 1000,
		currency: 'usd',
		interval: 'month',
		status: 'active',
		...overrides,
	}
}

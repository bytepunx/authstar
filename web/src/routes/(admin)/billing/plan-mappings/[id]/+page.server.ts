import { error, fail, redirect } from '@sveltejs/kit'
import type { Actions, PageServerLoad } from './$types'
import { requireSection } from '$lib/server/guard'
import { KeepRequestError } from '$lib/server/clients/keep'
import { parseGrantedRoles } from '$lib/server/plan-mapping-form'

export const load: PageServerLoad = async ({ locals, params }) => {
	const session = requireSection(locals.session, 'billing')
	const planMapping = await locals.clients.keep.getPlanMapping(session.tenantSlug, params.id)
	if (!planMapping) {
		error(404, 'plan mapping not found')
	}
	return { planMapping }
}

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		const session = requireSection(locals.session, 'billing')
		const form = await request.formData()

		const name = String(form.get('name') ?? '').trim()
		const seatLimitRaw = String(form.get('seatLimit') ?? '').trim()
		const apiKeyLimitRaw = String(form.get('apiKeyLimit') ?? '').trim()
		const apiKeyRateLimitRaw = String(form.get('apiKeyRateLimitRequestsPerMinute') ?? '').trim()
		const apiKeyRateLimitBurstRaw = String(form.get('apiKeyRateLimitBurst') ?? '').trim()
		const { roles: grantedRoles, invalid: invalidRoles } = parseGrantedRoles(form.get('grantedRoles'))

		const fieldErrors: Record<string, string> = {}
		if (!name) fieldErrors.name = 'name is required'
		if (invalidRoles.length > 0) {
			fieldErrors.grantedRoles = `each entry must be "application:role" -- invalid: ${invalidRoles.join(', ')}`
		}
		if (apiKeyRateLimitBurstRaw && !apiKeyRateLimitRaw) {
			fieldErrors.apiKeyRateLimitBurst = 'burst only applies alongside a requests-per-minute rate limit'
		}
		if (Object.keys(fieldErrors).length > 0) {
			return fail(400, { fieldErrors })
		}

		try {
			await locals.clients.keep.updatePlanMapping(session.tenantSlug, params.id, {
				name,
				seatLimit: seatLimitRaw ? Number(seatLimitRaw) : null,
				grantedRoles,
				meter: String(form.get('meter') ?? '').trim() || null,
				apiKeyLimit: apiKeyLimitRaw ? Number(apiKeyLimitRaw) : null,
				apiKeyRateLimit: apiKeyRateLimitRaw
					? {
							requestsPerMinute: Number(apiKeyRateLimitRaw),
							...(apiKeyRateLimitBurstRaw ? { burst: Number(apiKeyRateLimitBurstRaw) } : {}),
						}
					: null,
			})
			return { success: true }
		} catch (err) {
			if (err instanceof KeepRequestError) {
				return fail(err.status >= 500 ? 502 : 400, {
					formError:
						'keep rejected this update -- check every granted role references an existing, active application/role',
				})
			}
			throw err
		}
	},

	retire: async ({ locals, params }) => {
		const session = requireSection(locals.session, 'billing')
		await locals.clients.keep.retirePlanMapping(session.tenantSlug, params.id)
		redirect(303, '/billing/plan-mappings')
	},
}

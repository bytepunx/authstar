import { fail, redirect } from '@sveltejs/kit'
import type { Actions, PageServerLoad } from './$types'
import { requireSection } from '$lib/server/guard'
import { KeepRequestError } from '$lib/server/clients/keep'
import { parseGrantedRoles } from '$lib/server/plan-mapping-form'

export const load: PageServerLoad = async ({ locals }) => {
	requireSection(locals.session, 'billing')
	return {}
}

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const session = requireSection(locals.session, 'billing')
		const form = await request.formData()

		const stripePriceId = String(form.get('stripePriceId') ?? '').trim()
		const name = String(form.get('name') ?? '').trim()
		const seatLimitRaw = String(form.get('seatLimit') ?? '').trim()
		const { roles: grantedRoles, invalid: invalidRoles } = parseGrantedRoles(form.get('grantedRoles'))

		const fieldErrors: Record<string, string> = {}
		if (!stripePriceId) fieldErrors.stripePriceId = 'Stripe price ID is required'
		if (!name) fieldErrors.name = 'name is required'
		if (invalidRoles.length > 0) {
			fieldErrors.grantedRoles = `each entry must be "application:role" -- invalid: ${invalidRoles.join(', ')}`
		}
		if (Object.keys(fieldErrors).length > 0) {
			return fail(400, { fieldErrors, values: Object.fromEntries(form) })
		}

		try {
			const created = await locals.clients.keep.createPlanMapping(session.tenantSlug, {
				stripePriceId,
				name,
				seatLimit: seatLimitRaw ? Number(seatLimitRaw) : null,
				grantedRoles,
				meter: String(form.get('meter') ?? '').trim() || null,
			})
			redirect(303, `/billing/plan-mappings#${created.id}`)
		} catch (err) {
			if (err instanceof KeepRequestError) {
				return fail(err.status >= 500 ? 502 : 400, {
					formError:
						'keep rejected this plan mapping -- check the Stripe price ID resolves against this tenant\'s account and every granted role references an existing, active application/role',
					values: Object.fromEntries(form),
				})
			}
			throw err
		}
	},
}

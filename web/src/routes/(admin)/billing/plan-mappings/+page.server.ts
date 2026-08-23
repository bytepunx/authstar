import type { Actions, PageServerLoad } from './$types'
import { requireSection } from '$lib/server/guard'

export const load: PageServerLoad = async ({ locals }) => {
	const session = requireSection(locals.session, 'billing')
	const planMappings = await locals.clients.keep.listPlanMappings(session.tenantSlug)
	return { planMappings }
}

export const actions: Actions = {
	retire: async ({ request, locals }) => {
		const session = requireSection(locals.session, 'billing')
		const form = await request.formData()
		const id = String(form.get('id') ?? '')
		await locals.clients.keep.retirePlanMapping(session.tenantSlug, id)
	},
}

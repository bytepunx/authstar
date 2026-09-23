import type { PageServerLoad } from './$types'
import { requireSection } from '$lib/server/guard'

export const load: PageServerLoad = async ({ locals }) => {
	const session = requireSection(locals.session, 'billing')
	const planMappings = await locals.clients.keep.listPlanMappings(session.tenantSlug)
	return { planMappings }
}

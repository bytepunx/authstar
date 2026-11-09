import type { PageServerLoad } from './$types'
import { requireSection } from '$lib/server/guard'
import { throwUpstreamError } from '$lib/server/upstream-error'

export const load: PageServerLoad = async ({ locals }) => {
	const session = requireSection(locals.session, 'billing')
	try {
		const planMappings = await locals.clients.keep.listPlanMappings(session.tenantSlug)
		return { planMappings }
	} catch (err) {
		throwUpstreamError(err)
	}
}

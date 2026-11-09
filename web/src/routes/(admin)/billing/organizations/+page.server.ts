import type { PageServerLoad } from './$types'
import { requireSection } from '$lib/server/guard'
import { throwUpstreamError } from '$lib/server/upstream-error'

export const load: PageServerLoad = async ({ locals }) => {
	const session = requireSection(locals.session, 'billing')
	try {
		const organizations = await locals.clients.tower.listOrganizations(session.tenantSlug)
		return { organizations }
	} catch (err) {
		throwUpstreamError(err)
	}
}

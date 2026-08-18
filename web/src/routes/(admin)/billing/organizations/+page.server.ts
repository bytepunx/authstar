import type { PageServerLoad } from './$types'
import { requireSection } from '$lib/server/guard'

export const load: PageServerLoad = async ({ locals }) => {
	const session = requireSection(locals.session, 'billing')
	const organizations = await locals.clients.tower.listOrganizations(session.tenantSlug)
	return { organizations }
}

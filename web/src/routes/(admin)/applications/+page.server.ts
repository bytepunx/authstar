import type { PageServerLoad } from './$types'
import { requireSection } from '$lib/server/guard'
import { throwUpstreamError } from '$lib/server/upstream-error'

// Story 003 (List): slug/name/hosts/status, `_admin` itself never among
// them -- tower's own `GET /tenants/{tenantSlug}/applications` already
// excludes it (tower Story 004), so no client-side filtering is needed
// here to uphold that.
export const load: PageServerLoad = async ({ locals }) => {
	const session = requireSection(locals.session, 'applications')
	try {
		const applications = await locals.clients.tower.listApplications(session.tenantSlug)
		return { applications }
	} catch (err) {
		throwUpstreamError(err)
	}
}

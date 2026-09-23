import type { PageServerLoad } from './$types'
import { requireSection } from '$lib/server/guard'

// Billing has no content of its own yet beyond Organizations (ADR 0100) --
// plan mappings/coupons/etc. are future work under this same section, per
// ADR 0049's fixed eight-section IA (organizations deliberately isn't its
// own top-level nav entry).
export const load: PageServerLoad = async ({ locals }) => {
	requireSection(locals.session, 'billing')
	return {}
}

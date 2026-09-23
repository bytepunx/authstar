import type { LayoutServerLoad } from './$types'
import { requireSession } from '$lib/server/guard'
import { visibleSections } from '$lib/permissions'

// `_admin` shell (Story 001): every route under this group requires a
// verified session -- portcullis's own gate (Story 013, referenced by
// Story 001) means an unauthenticated request should never reach here in
// production, but this guard is what actually enforces it from `web`'s own
// side (misconfiguration, direct testing, etc.), rather than trusting that
// invariant silently.
export const load: LayoutServerLoad = async ({ locals, url }) => {
	const session = requireSession(locals.session)
	return {
		session,
		sections: visibleSections(session.permissions),
		currentPath: url.pathname,
	}
}

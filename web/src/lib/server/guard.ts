import { error } from '@sveltejs/kit'
import type { Session } from './session'
import { canAccessSection } from '$lib/permissions'

// Story 001: "Route-level enforcement backs the navigation-level hiding --
// a direct URL visit to a section the account can't see redirects or shows
// a clear 'you don't have access' state, never a silent 404 or a broken
// partial render." These two guards are that enforcement, called from each
// section's own +layout.server.ts/+page.server.ts. They are a UX
// improvement, not the security boundary -- tower/keep/herald independently
// enforce every permission server-side regardless of what this layer does
// (Story 001's own framing: "a route guard bug here is a broken UI, not a
// security hole").

export function requireSession(session: Session | null): Session {
	if (!session) {
		throw error(401, 'authentication required')
	}
	return session
}

export function requireSection(session: Session | null, sectionId: string): Session {
	const authenticated = requireSession(session)
	if (!canAccessSection(authenticated.permissions, sectionId)) {
		throw error(403, `this account does not have access to the "${sectionId}" section`)
	}
	return authenticated
}

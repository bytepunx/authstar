import type { LayoutServerLoad } from './$types'
import { requireSession } from '$lib/server/guard'

// design/adrs/0101-api-keys.md. The first individual-account-scoped
// (not organization-scoped) embed surface in `web` -- gated on
// `requireSession` alone, no membership check, since a personal API key is
// self-service (an account manages its own keys, never someone else's).
// Tower's own `requireAppRole` (a live re-fetch of the account's current
// `grantedRoles`, not anything from this session's own claims -- see
// `permissions.ts`'s header comment) is the real, authoritative gate for
// whether this account can actually create/list/revoke keys for the
// `[applicationSlug]` in the URL; this layer only proves "logged in."
export const load: LayoutServerLoad = async ({ locals, url }) => {
	const session = requireSession(locals.session)

	// Same theming contract as `(embed)/organizations/[organizationId]`'s
	// own layout -- see that file's header comment for the full rationale.
	// Duplicated rather than shared: exactly two call sites so far, and this
	// codebase's own convention (`lib/role-definition-lookup.ts`'s header
	// comment) is to extract only once a third one needs it.
	const primaryColorParam = url.searchParams.get('primaryColor')
	const fontFamilyParam = url.searchParams.get('fontFamily')
	const theme = {
		primaryColor: primaryColorParam && /^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]{3,20}$/.test(primaryColorParam) ? primaryColorParam : undefined,
		fontFamily: fontFamilyParam && /^[a-zA-Z0-9 ,'"-]{1,80}$/.test(fontFamilyParam) ? fontFamilyParam : undefined,
	}

	return { session, theme }
}

// Story 010 (Public Signup Page): "the ONE place in this entire design
// where `web` calls a backend service without an internal JWT or any
// portcullis mediation at all" -- submitted directly from the browser to
// tower's pre-tenant ingress (`POST /tenants`), which is why this is a
// plain browser-`fetch` call rather than a SvelteKit form action: a form
// action would run server-side, defeating the reason this route needs
// tower's CORS configured for `signup.{baseDomain}` at all. Factored out of
// the `.svelte` component so it's unit-testable with a fake `fetch`, no
// browser needed.

export interface SignupInput {
	name: string
	slug: string
	adminEmail: string
}

export type SignupResult =
	| { outcome: 'success' }
	| { outcome: 'validation-error'; fieldErrors: Record<string, string> }
	// Story 010: "if provisioning fails partway through, the message should
	// say retrying the same slug is the correct next action" -- this is a
	// distinct outcome from validation-error specifically so the UI can
	// deliver that guidance, not a generic failure message.
	| { outcome: 'retry-same-slug'; message: string }

export function validateSignupInput(input: SignupInput): Record<string, string> {
	const errors: Record<string, string> = {}
	if (!input.name.trim()) errors.name = 'name is required'
	if (!/^[a-z0-9-]+$/.test(input.slug)) errors.slug = 'slug must be lowercase letters, numbers, and hyphens only'
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.adminEmail)) errors.adminEmail = 'a valid email is required'
	return errors
}

export async function submitSignup(
	fetchImpl: typeof globalThis.fetch,
	towerBaseUrl: string,
	input: SignupInput,
): Promise<SignupResult> {
	const fieldErrors = validateSignupInput(input)
	if (Object.keys(fieldErrors).length > 0) {
		return { outcome: 'validation-error', fieldErrors }
	}

	// No `adminHost` field -- Story 010: operator-only via steward, a
	// self-service signup never gets to choose `_admin`'s host.
	const response = await fetchImpl(`${towerBaseUrl}/tenants`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ name: input.name, slug: input.slug, adminEmail: input.adminEmail }),
	})

	if (response.ok) {
		return { outcome: 'success' }
	}

	return {
		outcome: 'retry-same-slug',
		message: `Something went wrong setting up "${input.slug}". Try again with the same slug -- it's safe to retry.`,
	}
}

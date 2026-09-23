import type { PageServerLoad } from './$types'

// Story 010: "No live API call of any kind -- portcullis attaches
// `tenant.branding` and the resolved application's exposed-provider list
// (with loginPaths already resolved to full URLs) as request headers
// before proxying; this page reads those headers and renders, nothing
// else." Exempt route -- no session guard, matches Story 010's own framing
// that this page's failure mode is "never gets hit" (portcullis falls back
// to its own unbranded page if `web` is unreachable), not something to
// handle defensively beyond tolerating missing/malformed headers.
//
// Header names are a documented assumption: no portcullis story in this
// design repo specifies the literal header names ADR 0066 says portcullis
// "attaches directly to the proxied request as headers" -- these two names
// are this route's own reasonable default (mirrors hooks.server.ts's same
// assumption for the tenant-slug header), not a cited requirement. Real
// wiring depends on portcullis's eventual proxy-through implementation.
const BRANDING_HEADER = 'x-authstar-tenant-branding'
const PROVIDERS_HEADER = 'x-authstar-providers'

export interface TenantBranding {
	productName: string
	logoUrl: string | null
	primaryColor: string | null
}

export interface SelectableProvider {
	name: string
	label: string
	loginPath: string
}

const DEFAULT_BRANDING: TenantBranding = {
	productName: 'authstar',
	logoUrl: null,
	primaryColor: null,
}

function parseHeader<T>(raw: string | null, fallback: T): T {
	if (!raw) return fallback
	try {
		return JSON.parse(raw) as T
	} catch {
		// Malformed header from an upstream misconfiguration is not this
		// page's problem to surface as an error -- render the generic
		// fallback rather than 500ing what's supposed to be the one page
		// that never fails defensively.
		return fallback
	}
}

export const load: PageServerLoad = async ({ request }) => {
	const branding = parseHeader<TenantBranding>(request.headers.get(BRANDING_HEADER), DEFAULT_BRANDING)
	const providers = parseHeader<SelectableProvider[]>(request.headers.get(PROVIDERS_HEADER), [])
	return { branding, providers }
}

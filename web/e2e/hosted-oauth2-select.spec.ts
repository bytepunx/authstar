import { expect, test } from '@playwright/test'

// Story 010: `/oauth2/select` is exempt (no session needed) and purely
// header-driven -- portcullis attaches branding + provider-list headers
// before proxying. `page.setExtraHTTPHeaders` applies to the real
// top-level navigation request Playwright's browser sends, standing in for
// what portcullis would attach in production.

test('renders tenant branding and the provider list from request headers, no login required', async ({
	page,
	context,
}) => {
	const branding = { productName: 'Acme Corp', logoUrl: null, primaryColor: '#7c3aed' }
	const providers = [
		{ name: 'google', label: 'Google', loginPath: 'https://widgetco.acme.example.com/oauth2/google/login' },
		{ name: 'github', label: 'GitHub', loginPath: 'https://widgetco.acme.example.com/oauth2/github/login' },
	]

	await context.setExtraHTTPHeaders({
		'x-authstar-tenant-branding': JSON.stringify(branding),
		'x-authstar-providers': JSON.stringify(providers),
	})

	const response = await page.goto('/oauth2/select')
	expect(response?.status()).toBe(200)
	await expect(page.getByRole('heading', { name: 'Acme Corp' })).toBeVisible()
	await expect(page.getByTestId('provider-google')).toBeVisible()
	await expect(page.getByTestId('provider-github')).toBeVisible()
	await expect(page.getByTestId('provider-google')).toHaveAttribute(
		'href',
		'https://widgetco.acme.example.com/oauth2/google/login',
	)
})

test('renders a generic fallback with no providers when no headers are present -- never errors', async ({ page }) => {
	const response = await page.goto('/oauth2/select')
	expect(response?.status()).toBe(200)
	await expect(page.getByRole('heading', { name: 'authstar' })).toBeVisible()
	await expect(page.getByText('No sign-in providers are configured')).toBeVisible()
})

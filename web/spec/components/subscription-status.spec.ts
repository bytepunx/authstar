import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { defineAuthstarSubscriptionStatus } from '../../src/widgets/subscription-status'

beforeAll(() => {
	defineAuthstarSubscriptionStatus()
})

afterEach(() => {
	document.body.innerHTML = ''
	vi.unstubAllGlobals()
})

function mockFetchOnce(status: number, body: unknown) {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(JSON.stringify(body), { status })),
	)
}

async function renderAndWaitForLoad(html = '<authstar-subscription-status></authstar-subscription-status>') {
	document.body.innerHTML = html
	const el = document.body.firstElementChild as HTMLElement
	await new Promise<void>((resolve) => {
		el.addEventListener('authstar-subscription-status:loaded', () => resolve(), { once: true })
		el.addEventListener('authstar-subscription-status:error', () => resolve(), { once: true })
	})
	return el
}

describe('<authstar-subscription-status>', () => {
	it('fetches the same-origin subscription endpoint by default', async () => {
		mockFetchOnce(200, { status: 'active', planName: 'Growth', currentPeriodEnd: '2026-09-01' })
		await renderAndWaitForLoad()
		expect(fetch).toHaveBeenCalledWith('/_authstar/me/subscription', expect.objectContaining({ credentials: 'same-origin' }))
	})

	it('renders plan/status and period end for an active subscription', async () => {
		mockFetchOnce(200, { status: 'active', planName: 'Growth', currentPeriodEnd: '2026-09-01' })
		const el = await renderAndWaitForLoad()
		const status = el.shadowRoot!.querySelector('[data-testid="subscription-status"]')
		expect(status?.textContent).toContain('Growth')
		expect(status?.textContent).toContain('active')
		expect(el.shadowRoot!.querySelector('[data-testid="subscription-period-end"]')?.textContent).toContain(
			'2026-09-01',
		)
	})

	it('renders a neutral empty state for status: null, not an error', async () => {
		mockFetchOnce(200, { status: null, planName: null, currentPeriodEnd: null })
		const el = await renderAndWaitForLoad()
		expect(el.shadowRoot!.querySelector('[data-testid="subscription-empty"]')).not.toBeNull()
		expect(el.shadowRoot!.querySelector('[data-testid="subscription-error"]')).toBeNull()
	})

	it('links past_due to /_authstar/upgrade rather than building its own payment-retry flow', async () => {
		mockFetchOnce(200, { status: 'past_due', planName: 'Growth', currentPeriodEnd: null })
		const el = await renderAndWaitForLoad()
		const link = el.shadowRoot!.querySelector('[data-testid="subscription-upgrade-link"]') as HTMLAnchorElement
		expect(link.getAttribute('href')).toBe('/_authstar/upgrade')
	})

	it('renders an error state (not a crash) on a non-ok response, and dispatches the error event', async () => {
		mockFetchOnce(500, { error: 'boom' })
		const el = await renderAndWaitForLoad()
		expect(el.shadowRoot!.querySelector('[data-testid="subscription-error"]')).not.toBeNull()
	})

	it('honors the endpoint attribute override', async () => {
		mockFetchOnce(200, { status: 'active', planName: 'Growth', currentPeriodEnd: '2026-09-01' })
		await renderAndWaitForLoad(
			'<authstar-subscription-status endpoint="/custom/subscription"></authstar-subscription-status>',
		)
		expect(fetch).toHaveBeenCalledWith('/custom/subscription', expect.anything())
	})
})

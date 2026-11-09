import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/svelte'

// web's root error page (src/routes/+error.svelte) reads the status from
// `page` in `$app/state`. The mock below stands in for SvelteKit's runtime,
// so each case sets the status and error a real failure would produce.
const state = vi.hoisted(() => ({
	page: { status: 500, error: { message: '' } as { message: string } | null },
}))

vi.mock('$app/state', () => state)

import ErrorPage from '../../src/routes/+error.svelte'

function renderWith(status: number, message: string) {
	state.page.status = status
	state.page.error = { message }
	return render(ErrorPage)
}

afterEach(() => {
	vi.restoreAllMocks()
})

describe('+error.svelte', () => {
	it('says a missing page does not exist', () => {
		renderWith(404, 'Not Found: /identity')

		expect(screen.getByTestId('error-title')).toHaveTextContent('Page not found')
		expect(screen.getByTestId('error-detail')).toHaveTextContent('This page does not exist.')
	})

	it('says the account has no access on a 403', () => {
		renderWith(403, 'Forbidden')

		expect(screen.getByTestId('error-title')).toHaveTextContent('No access')
		expect(screen.getByTestId('error-detail')).toHaveTextContent('does not have access')
	})

	it('says a service did not respond on a 502, without the upstream message', () => {
		renderWith(502, 'tower answered 500: {"stack":"Error at db.query"}')

		expect(screen.getByTestId('error-title')).toHaveTextContent('Service unavailable')
		expect(screen.getByTestId('error-detail')).toHaveTextContent('did not respond')
		expect(document.body).not.toHaveTextContent('db.query')
	})

	it('shows a plain message, never the raw message, for an unexpected error', () => {
		renderWith(500, 'TypeError: Cannot read properties of undefined at load (+page.server.ts:12)')

		expect(screen.getByTestId('error-title')).toHaveTextContent('Something went wrong')
		expect(document.body).not.toHaveTextContent('TypeError')
		expect(document.body).not.toHaveTextContent('+page.server.ts')
	})

	it('links back to the home page', () => {
		renderWith(404, 'Not Found')

		expect(screen.getByTestId('error-home')).toHaveAttribute('href', '/')
	})

	it('goes to the previous page from its back control', async () => {
		const back = vi.spyOn(history, 'back').mockImplementation(() => {})
		renderWith(404, 'Not Found')

		await fireEvent.click(screen.getByTestId('error-back'))

		expect(back).toHaveBeenCalledOnce()
	})
})

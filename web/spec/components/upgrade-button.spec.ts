import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { defineAuthstarUpgradeButton } from '../../src/widgets/upgrade-button'

// Component tier: the widget's actual public contract with an adopting
// page -- its attributes -- verified by instantiating the real custom
// element in jsdom, no framework involved (it has none at runtime).

beforeAll(() => {
	defineAuthstarUpgradeButton()
})

afterEach(() => {
	document.body.innerHTML = ''
})

function render(html: string): HTMLElement {
	document.body.innerHTML = html
	return document.body.firstElementChild as HTMLElement
}

describe('<authstar-upgrade-button>', () => {
	it('registers as a real custom element', () => {
		expect(customElements.get('authstar-upgrade-button')).toBeDefined()
	})

	it('defaults to the standard hosted upgrade path and "Upgrade" label', () => {
		const el = render('<authstar-upgrade-button></authstar-upgrade-button>')
		const anchor = el.shadowRoot!.querySelector('a')!
		expect(anchor.getAttribute('href')).toBe('/_authstar/upgrade')
		expect(anchor.textContent).toBe('Upgrade')
	})

	it('honors the label and href attributes', () => {
		const el = render('<authstar-upgrade-button label="Go Pro" href="/custom/upgrade"></authstar-upgrade-button>')
		const anchor = el.shadowRoot!.querySelector('a')!
		expect(anchor.textContent).toBe('Go Pro')
		expect(anchor.getAttribute('href')).toBe('/custom/upgrade')
	})

	it('re-renders when an observed attribute changes after connection', () => {
		const el = render('<authstar-upgrade-button></authstar-upgrade-button>')
		el.setAttribute('label', 'Updated Label')
		const anchor = el.shadowRoot!.querySelector('a')!
		expect(anchor.textContent).toBe('Updated Label')
	})

	it('renders inside a shadow root -- host page styles never leak in or out', () => {
		const el = render('<authstar-upgrade-button></authstar-upgrade-button>')
		expect(el.shadowRoot).not.toBeNull()
		expect(el.shadowRoot!.mode).toBe('open')
	})
})

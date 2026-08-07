import { THEME_BASE_CSS } from './theme'

// Story 011: "No data fetch -- a styled `<a href="/_authstar/upgrade">`.
// The simplest widget by construction." Public API (its actual "contract"
// with an adopting page, per this widget category's own test approach):
//   - attribute `label` (optional, defaults to "Upgrade")
//   - attribute `href` (optional, defaults to the standard hosted path --
//     overridable only for local/test embedding against a different origin)
// No events, no slots -- nothing else to test.
export class AuthstarUpgradeButton extends HTMLElement {
	static get observedAttributes() {
		return ['label', 'href']
	}

	#root: ShadowRoot
	#anchor: HTMLAnchorElement

	constructor() {
		super()
		this.#root = this.attachShadow({ mode: 'open' })
		const style = document.createElement('style')
		style.textContent = THEME_BASE_CSS
		this.#anchor = document.createElement('a')
		this.#anchor.className = 'authstar-button'
		this.#root.append(style, this.#anchor)
	}

	connectedCallback() {
		this.#render()
	}

	attributeChangedCallback() {
		this.#render()
	}

	#render() {
		this.#anchor.href = this.getAttribute('href') ?? '/_authstar/upgrade'
		this.#anchor.textContent = this.getAttribute('label') ?? 'Upgrade'
	}
}

export function defineAuthstarUpgradeButton() {
	if (!customElements.get('authstar-upgrade-button')) {
		customElements.define('authstar-upgrade-button', AuthstarUpgradeButton)
	}
}

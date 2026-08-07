import { THEME_BASE_CSS } from './theme'

// Story 011: `GET /_authstar/me/subscription` -- status/planName,
// currentPeriodEnd for active/trialing. `status: null` (keep's "no
// subscription" response) renders as an empty/neutral state, not an error.
// `past_due` links to `/_authstar/upgrade` (the existing hosted page,
// Story 010) rather than building its own payment-retry flow.
//
// Public API (this widget's actual contract with an adopting page):
//   - attribute `endpoint` (optional override of the fetch URL, default
//     `/_authstar/me/subscription` -- same-origin relative per ADR 0071,
//     no CORS needed on a real embed; overridable so this file's own tests
//     don't need a real portcullis in front of them)
//   - dispatches `authstar-subscription-status:loaded` (detail: the parsed
//     subscription, or `null`) and `authstar-subscription-status:error`
//     (detail: the Error) -- the observable signal an adopting page or a
//     test can hook without inspecting shadow-DOM markup.
export interface SubscriptionInfo {
	status: 'active' | 'trialing' | 'past_due' | 'canceled' | null
	planName: string | null
	currentPeriodEnd: string | null
}

export class AuthstarSubscriptionStatus extends HTMLElement {
	#root: ShadowRoot
	#body: HTMLDivElement

	constructor() {
		super()
		this.#root = this.attachShadow({ mode: 'open' })
		const style = document.createElement('style')
		style.textContent = THEME_BASE_CSS
		this.#body = document.createElement('div')
		this.#root.append(style, this.#body)
	}

	connectedCallback() {
		this.#load()
	}

	get endpoint(): string {
		return this.getAttribute('endpoint') ?? '/_authstar/me/subscription'
	}

	async #load() {
		this.#body.textContent = 'Loading...'
		try {
			const response = await fetch(this.endpoint, { credentials: 'same-origin' })
			if (!response.ok) {
				throw new Error(`subscription fetch failed: ${response.status}`)
			}
			const data = (await response.json()) as SubscriptionInfo
			this.#renderSubscription(data)
			this.dispatchEvent(
				new CustomEvent('authstar-subscription-status:loaded', { detail: data, bubbles: true, composed: true }),
			)
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err))
			this.#renderError(error)
			this.dispatchEvent(
				new CustomEvent('authstar-subscription-status:error', { detail: error, bubbles: true, composed: true }),
			)
		}
	}

	#renderSubscription(data: SubscriptionInfo) {
		this.#body.innerHTML = ''
		if (data.status === null) {
			const empty = document.createElement('p')
			empty.dataset.testid = 'subscription-empty'
			empty.textContent = 'No active subscription.'
			this.#body.append(empty)
			return
		}

		const status = document.createElement('p')
		status.dataset.testid = 'subscription-status'
		status.textContent = `${data.planName ?? 'Plan'} -- ${data.status}`
		this.#body.append(status)

		if (data.status === 'active' || data.status === 'trialing') {
			if (data.currentPeriodEnd) {
				const period = document.createElement('p')
				period.dataset.testid = 'subscription-period-end'
				period.textContent = `Renews ${data.currentPeriodEnd}`
				this.#body.append(period)
			}
		}

		if (data.status === 'past_due') {
			const link = document.createElement('a')
			link.className = 'authstar-button'
			link.dataset.testid = 'subscription-upgrade-link'
			link.href = '/_authstar/upgrade'
			link.textContent = 'Update payment method'
			this.#body.append(link)
		}
	}

	#renderError(error: Error) {
		this.#body.innerHTML = ''
		const message = document.createElement('p')
		message.dataset.testid = 'subscription-error'
		message.textContent = `Unable to load subscription: ${error.message}`
		this.#body.append(message)
	}
}

export function defineAuthstarSubscriptionStatus() {
	if (!customElements.get('authstar-subscription-status')) {
		customElements.define('authstar-subscription-status', AuthstarSubscriptionStatus)
	}
}

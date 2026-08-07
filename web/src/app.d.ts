import type { Session } from '$lib/server/session'
import type { TowerClient } from '$lib/server/clients/tower'

// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			// `null` when the request carries no verified internal JWT at all
			// (an exempt/hosted-pages route, e.g. /oauth2/select). Populated by
			// src/hooks.server.ts from the `Authorization: Bearer` header
			// portcullis attaches per Story 010 -- never trusted from any other
			// source (never a query param, never a client-settable header).
			session: Session | null
			// Server-side backend clients (tower/keep/...), forwarding the same
			// internal JWT the request itself carried -- per Story 001, `web`
			// never calls a backend service client-side. Injected here (rather
			// than imported directly by routes) so behavior/integration tests
			// can substitute fakes without touching route code.
			clients: {
				tower: TowerClient
			}
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {}

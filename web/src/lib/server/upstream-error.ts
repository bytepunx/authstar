import { error, fail, type ActionFailure } from '@sveltejs/kit'
import { TowerNotFoundError, TowerRequestError } from './clients/tower'
import { KeepNotFoundError, KeepRequestError } from './clients/keep'

// S-0011: a tower or keep failure in a load or action becomes a handled
// error, rendered by the root `+error.svelte` (loads) or shown as the form's
// `formError` (actions), never SvelteKit's default 500. This module is the
// boundary where such a failure is handled, so it is also where it is
// logged, once (logging.md). The upstream's response body is never logged
// nor shown: it may carry anything the upstream chose to put there.

/** The upstream services web's server routes call. */
export type UpstreamService = 'tower' | 'keep'

/** What a tower or keep request error means for the page that hit it. */
export interface UpstreamFailure {
	service: UpstreamService
	/** The status the upstream answered with. */
	upstreamStatus: number
	/** The status web answers with: 502 for an upstream 5xx, else the upstream's own. */
	status: number
	/** A plain message for the page, naming the service. */
	message: string
}

/** Classifies a tower or keep request error; null for any other error. */
export function classifyUpstreamError(err: unknown): UpstreamFailure | null {
	let service: UpstreamService
	let upstreamStatus: number
	if (err instanceof TowerNotFoundError) {
		service = 'tower'
		upstreamStatus = 404
	} else if (err instanceof TowerRequestError) {
		service = 'tower'
		upstreamStatus = err.status
	} else if (err instanceof KeepNotFoundError) {
		service = 'keep'
		upstreamStatus = 404
	} else if (err instanceof KeepRequestError) {
		service = 'keep'
		upstreamStatus = err.status
	} else {
		return null
	}

	if (upstreamStatus >= 500 || upstreamStatus < 400) {
		return { service, upstreamStatus, status: 502, message: `${service} did not answer -- try again in a moment` }
	}
	if (upstreamStatus === 404) {
		return { service, upstreamStatus, status: 404, message: 'not found' }
	}
	return { service, upstreamStatus, status: upstreamStatus, message: `${service} rejected this request` }
}

function logUpstreamFailure(failure: UpstreamFailure, err: Error): void {
	// Services log to stdout for the platform's collector, one JSON event per
	// line (logging.md). `err` is the client's own message -- method, path,
	// and status -- never the response body.
	console.log(
		JSON.stringify({
			ts: new Date().toISOString(),
			level: failure.status === 502 ? 'error' : 'warn',
			component: 'web',
			msg: 'upstream request failed',
			service: failure.service,
			status: failure.upstreamStatus,
			err: err.message,
		}),
	)
}

/** Throws the SvelteKit error a tower or keep request error maps to; re-throws any other error as it is. */
export function throwUpstreamError(err: unknown): never {
	const failure = classifyUpstreamError(err)
	if (!failure) throw err
	logUpstreamFailure(failure, err as Error)
	error(failure.status, failure.message)
}

/** Returns the `fail(status, { formError })` a tower or keep request error maps to; re-throws any other error as it is. */
export function failUpstream(err: unknown): ActionFailure<{ formError: string }> {
	const failure = classifyUpstreamError(err)
	if (!failure) throw err
	logUpstreamFailure(failure, err as Error)
	return fail(failure.status, { formError: failure.message })
}

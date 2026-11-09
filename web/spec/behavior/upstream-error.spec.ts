import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { isActionFailure, isHttpError } from '@sveltejs/kit'
import { classifyUpstreamError, failUpstream, throwUpstreamError } from '../../src/lib/server/upstream-error'
import { TowerNotFoundError, TowerRequestError } from '../../src/lib/server/clients/tower'
import { KeepNotFoundError, KeepRequestError } from '../../src/lib/server/clients/keep'

// Behavior tier: S-0011's mapping from a tower or keep request error to a
// handled SvelteKit error, tested directly with no route involved -- the
// same way permissions.spec.ts tests the section-gating table.

function thrownBy(fn: () => unknown): unknown {
	try {
		fn()
	} catch (err) {
		return err
	}
	return expect.unreachable('expected a throw')
}

describe('classifyUpstreamError', () => {
	it('maps a tower 5xx to 502, naming tower', () => {
		expect(classifyUpstreamError(new TowerRequestError('tower: GET /x -> 503', 503))).toEqual({
			service: 'tower',
			upstreamStatus: 503,
			status: 502,
			message: 'tower did not answer -- try again in a moment',
		})
	})

	it('maps a keep 5xx to 502, naming keep', () => {
		const failure = classifyUpstreamError(new KeepRequestError('keep: GET /x -> 500', 500))
		expect(failure?.status).toBe(502)
		expect(failure?.message).toContain('keep')
	})

	it('keeps a 404 a 404, for both services', () => {
		expect(classifyUpstreamError(new TowerNotFoundError('tower: GET /x -> 404'))?.status).toBe(404)
		expect(classifyUpstreamError(new KeepNotFoundError('keep: GET /x -> 404'))?.status).toBe(404)
	})

	it('passes any other upstream status through with a plain message', () => {
		const failure = classifyUpstreamError(new TowerRequestError('tower: POST /x -> 409', 409, { error: 'raw upstream detail' }))
		expect(failure).toMatchObject({ status: 409, message: 'tower rejected this request' })
	})

	it('returns null for an error that is not a tower or keep request error', () => {
		expect(classifyUpstreamError(new Error('a bug'))).toBeNull()
		expect(classifyUpstreamError(new TypeError('x is undefined'))).toBeNull()
	})
})

describe('throwUpstreamError and failUpstream', () => {
	let log: MockInstance<typeof console.log>

	beforeEach(() => {
		log = vi.spyOn(console, 'log').mockImplementation(() => {})
	})

	afterEach(() => {
		log.mockRestore()
	})

	it('throwUpstreamError throws an HttpError with status 502 for a tower 500', () => {
		const err = thrownBy(() => throwUpstreamError(new TowerRequestError('tower: GET /x -> 500', 500)))
		expect(isHttpError(err)).toBe(true)
		if (isHttpError(err)) {
			expect(err.status).toBe(502)
			expect(err.body.message).toBe('tower did not answer -- try again in a moment')
		}
	})

	it('throwUpstreamError re-throws any other error as it is', () => {
		const bug = new Error('a bug')
		expect(thrownBy(() => throwUpstreamError(bug))).toBe(bug)
		expect(log).not.toHaveBeenCalled()
	})

	it('failUpstream returns fail(502, { formError }) for a keep 500', () => {
		const result = failUpstream(new KeepRequestError('keep: POST /x -> 500', 500))
		expect(isActionFailure(result)).toBe(true)
		expect(result.status).toBe(502)
		expect(result.data).toEqual({ formError: 'keep did not answer -- try again in a moment' })
	})

	it('failUpstream re-throws any other error as it is', () => {
		const bug = new TypeError('x is undefined')
		expect(thrownBy(() => failUpstream(bug))).toBe(bug)
	})

	it('logs one structured event at the boundary, with the service and status and never the body', () => {
		failUpstream(new TowerRequestError('tower: DELETE /tenants/acme/applications/x -> 500', 500, { secret: 'never-logged' }))

		expect(log).toHaveBeenCalledTimes(1)
		const line = String(log.mock.calls[0][0])
		const event = JSON.parse(line)
		expect(event).toMatchObject({
			level: 'error',
			component: 'web',
			msg: 'upstream request failed',
			service: 'tower',
			status: 500,
			err: 'tower: DELETE /tenants/acme/applications/x -> 500',
		})
		expect(typeof event.ts).toBe('string')
		expect(line).not.toContain('never-logged')
	})

	it('logs a non-5xx upstream rejection at warn', () => {
		failUpstream(new KeepRequestError('keep: POST /x -> 409', 409))
		expect(JSON.parse(String(log.mock.calls[0][0])).level).toBe('warn')
	})
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApiError } from '@slc/api-client'
import { isAbort, undefinedUnlessAborted } from './fallback.ts'

/**
 * A view-first read swallows a failure so the caller can try the base table. It must NOT
 * swallow an abort: an abort says nothing about the view, and treating it as "unavailable"
 * made every unmounted render run the whole fallback cascade — the base table plus the four
 * description masters the view exists to replace — for a result already being discarded.
 */
describe('undefinedUnlessAborted', () => {
  const abortError = (): Error => {
    const e = new Error('aborted')
    e.name = 'AbortError'
    return e
  }

  it('swallows a real failure, so the caller falls back', () => {
    assert.equal(undefinedUnlessAborted(new ApiError('view missing', 404, undefined)), undefined)
    assert.equal(undefinedUnlessAborted(new ApiError('gateway down', 502, undefined)), undefined)
    assert.equal(undefinedUnlessAborted(new TypeError('network')), undefined)
  })

  it('rethrows a bare AbortError', () => {
    assert.throws(() => undefinedUnlessAborted(abortError()), /aborted/)
  })

  it('rethrows an abort wrapped by apiRequest as ApiError(…, 0, cause)', () => {
    // The wrapper is the reason a naive name check is not enough: the outer error is called
    // 'ApiError' with status 0, which is indistinguishable from an unreachable gateway.
    const wrapped = new ApiError('request failed', 0, abortError())
    assert.ok(isAbort(wrapped), 'the abort must be found through the wrapper')
    assert.throws(() => undefinedUnlessAborted(wrapped))
  })

  it('does not mistake a genuinely unreachable gateway for an abort', () => {
    const unreachable = new ApiError('request failed', 0, new TypeError('fetch failed'))
    assert.equal(isAbort(unreachable), false)
    assert.equal(undefinedUnlessAborted(unreachable), undefined)
  })
})

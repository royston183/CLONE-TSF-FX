import { strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApiError } from '@slc/api-client'
import { messageOf } from './master-contract.ts'

describe('messageOf', () => {
  it("reads the middleware's {error:{message}}", () => {
    strictEqual(messageOf(new ApiError('x', 400, { error: { message: 'Unknown column ZFOO' } })), 'Unknown column ZFOO')
  })

  it("reads the gateway's {error:{message:{value}}} instead of printing [object Object]", () => {
    strictEqual(messageOf(new ApiError('x', 502, { error: { message: { value: 'Backend unreachable.' } } })), 'Backend unreachable.')
  })

  it('says to sign in again when the session has gone', () => {
    const text = messageOf(new ApiError('Not signed in.', 401, { error: { message: { value: 'Not signed in.' } } }))
    strictEqual(text, 'Not signed in. Your session has expired — sign out and sign in again.')
  })

  it('falls back to the error text', () => {
    strictEqual(messageOf(new Error('boom')), 'boom')
    strictEqual(messageOf('plain'), 'plain')
  })
})

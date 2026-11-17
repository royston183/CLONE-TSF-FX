import assert from 'node:assert/strict'
import { test } from 'node:test'
import { upstreamAccept } from './proxy.ts'

test('a $batch may ask for multipart/mixed (SAP answers 406 to JSON there)', () => {
  assert.equal(upstreamAccept('multipart/mixed', '$batch'), 'multipart/mixed')
  assert.equal(upstreamAccept('multipart/mixed', '/$batch'), 'multipart/mixed')
})

test('multipart/mixed is not forwarded for any other call', () => {
  assert.equal(upstreamAccept('multipart/mixed', 'BillOfLading'), 'application/json')
})

test('XML is forwarded ($metadata), everything else is JSON', () => {
  assert.equal(upstreamAccept('application/xml', '$metadata'), 'application/xml')
  assert.equal(upstreamAccept(undefined, 'BillOfLading'), 'application/json')
  assert.equal(upstreamAccept('text/html', 'BillOfLading'), 'application/json')
})

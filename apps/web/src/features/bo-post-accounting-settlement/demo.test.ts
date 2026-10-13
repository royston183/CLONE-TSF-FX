import { strictEqual, ok } from 'node:assert/strict'
import { it } from 'node:test'
import { DEAL_LIBRARY } from './fixtures.ts'
import { demoBase, postDemo, restoreDemo } from './demo.ts'
import type { Deal } from './types.ts'

const fresh = (): Deal => {
  const d = structuredClone(DEAL_LIBRARY['TSF-9081']!)
  return { ...d, status: 21, inv: d.inv.map((r) => ({ ...r, fiDoc: '', postCheck: true })),
    top: d.top.map((r) => ({ ...r, doc1: '', doc2: '', status: 'Confirmed' })) }
}
const counter = () => { let n = 6800000000; return () => String(++n) }

it('blocks FX before invoices and execution before status 21', () => {
  const d = fresh()
  strictEqual(postDemo(d, 'fx', counter()).deal, d)
  const early = { ...d, status: 20 }
  strictEqual(postDemo(early, 'invoice', counter()).deal, early)
})
it('posts invoices then FX, advances to 22, and is repeat safe', () => {
  const d = fresh()
  const next = counter()
  const first = postDemo(d, 'invoice', next, 0).deal
  strictEqual(first.status, 21)
  ok(first.inv[0]!.fiDoc)
  ok(first.top.every((r) => !r.doc1))
  const result = postDemo(first, 'invoice', next).deal
  strictEqual(result.status, 22)
  strictEqual(result.statusCode, '22')
  ok(result.inv.every((r) => r.fiDoc))
  ok(result.top.every((r) => r.doc1 && r.doc2 && r.status === 'Posted'))
  const docs = [...result.inv.map((r) => r.fiDoc), ...result.top.flatMap((r) => [r.doc1, r.doc2])]
  strictEqual(new Set(docs).size, docs.length)
  strictEqual(postDemo(result, 'invoice', next).deal, result)
  strictEqual(d.inv[0]!.fiDoc, '')
})
it('restores documents by leg identity after refresh and fills only empty bank fields', () => {
  const d = fresh()
  const posted = postDemo(d, 'invoice', counter()).deal
  const reloaded = restoreDemo({ ...d, inv: [...d.inv].reverse() }, JSON.stringify(posted))
  strictEqual(reloaded.status, 22)
  strictEqual(reloaded.inv[0]!.fiDoc, posted.inv.at(-1)!.fiDoc)
  strictEqual(restoreDemo(d, 'broken').status, 21)
  d.inv[0]!.senderHouseBank = 'REAL1'
  d.inv[0]!.receiverHouseBank = ''
  const banks = demoBase(d)
  strictEqual(banks.inv[0]!.senderHouseBank, 'REAL1')
  strictEqual(banks.inv[0]!.receiverHouseBank, '')
})

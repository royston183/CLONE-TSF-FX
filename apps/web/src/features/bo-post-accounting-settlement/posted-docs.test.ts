import { deepStrictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { withPostedDocs } from './api.ts'
import type { FxLeg } from './types.ts'

describe('withPostedDocs', () => {
  const leg = (rfha: string, txnStatus: string): FxLeg => ({
    entity: 'IN11', dealType: 'D1', rfha, buyCurr: 'USD', buyAmt: 1, sellCurr: 'INR', sellAmt: 83, rate: 83,
    status: 'Confirmed', doc1: '', doc2: '', dssDeal: '', sgsart: '', txnStatus,
  })
  const docs = { doc1: '100000001', year1: '2026', doc2: '100000002', year2: '2026' }

  it('stored documents first; SAP is asked only for a posted leg without them', async () => {
    const asked: string[] = []
    const out = await withPostedDocs([leg('A', '50'), leg('B', '50'), leg('C', '07')], {
      stored: async (_c, t) => (t === 'A' ? docs : null),
      sap: async (_c, t) => {
        asked.push(t)
        return { ...docs, doc1: '200000001', doc2: '' }
      },
    })
    deepStrictEqual(asked, ['B'])
    deepStrictEqual(out.map((l) => [l.status, l.doc1, l.doc2]), [
      ['Posted', '100000001', '100000002'],
      ['Posted', '200000001', ''],
      ['Confirmed', '', ''],
    ])
  })

  it('posted with no document anywhere, or unreadable: Posted with blank documents', async () => {
    const out = await withPostedDocs([leg('A', '50')], { stored: async () => { throw new Error('down') }, sap: async () => null })
    deepStrictEqual([out[0]!.status, out[0]!.doc1], ['Posted', ''])
  })
})

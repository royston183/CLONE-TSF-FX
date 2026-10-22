import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { entryLines, loadFxEntries, type EntryPorts } from './postedEntries.ts'

const entry = {
  CompanyCode: 'SG03', FiscalYear: '2026', AccountingDocument: '100000007', DocumentDate: '2026-11-23', PostingDate: '2026-11-23',
  _Item: [
    { CompanyCode: 'SG03', GLAccount: '56000006', AmountInTransactionCurrency: 4000, TransactionCurrency: 'USD', ProfitCenter: 'SG030006', BusinessArea: '0975' },
    { CompanyCode: 'SG03', GLAccount: '', Customer: '700000502', AmountInTransactionCurrency: -4000, TransactionCurrency: 'USD', ProfitCenter: 'SG032003', BusinessArea: '0223' },
  ],
}

describe('posted FX entries', () => {
  it('maps journal items to Dr / Cr lines, with the G/L name where SAP gave one', () => {
    const lines = entryLines(entry, new Map([['56000006', 'Gains/Losses on FX - Trade']]))
    deepStrictEqual(lines.map((l) => [l.dc, l.account, l.description, l.amount, l.currency, l.profitCenter, l.businessArea]), [
      ['Dr', '56000006', 'Gains/Losses on FX - Trade', '4,000.00', 'USD', 'SG030006', '0975'],
      ['Cr', '700000502', '', '-4,000.00', 'USD', 'SG032003', '0223'],
    ])
    strictEqual(lines[0]!.postingDate, '23-11-2026')
  })

  it('FI Doc 2 is the Buy side, FI Doc 1 the Sell side; nothing posted gives nothing', async () => {
    const asked: string[] = []
    const ports: EntryPorts = {
      docs: async () => ({ doc1: '100000001', year1: '2026', doc2: '100000002', year2: '2026' }),
      journal: async (_c, _y, d) => { asked.push(d); return d === '100000002' ? entry : undefined },
      glName: async () => { throw new Error('down') },
    }
    const out = await loadFxEntries('SG03', 'X', ports)
    strictEqual(out.buy?.document, '100000002')
    strictEqual(out.buy?.lines.length, 2)
    deepStrictEqual([out.sell?.document, out.sell?.lines.length], ['100000001', 0])
    deepStrictEqual(await loadFxEntries('SG03', 'X', { ...ports, docs: async () => null }), { buy: null, sell: null })
  })
})

import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { clearDemoDeals, isoDate, parseDealDump, saveDemoDeals } from './demo-deals.ts'
import { SqliteStore } from './store.ts'

const head = ['Trade Date', 'Company Name', 'FX Model', 'Deal ID', 'Deal Type', 'Transaction', 'Descr', 'Amount 1', 'Currency 1', 'Amount 2', 'Currency 2', 'Partner Name', 'MC', 'Txn Status Desc', 'BA', 'PC', 'Commodity', 'FX P&L Amount']
const leg = (id: string, type: string, over: Record<number, string> = {}) => {
  const row = ['11/11/26', 'SG00 - OLAM International Ltd', 'M032', id, type, '6.2E+12', '', '10,000,000.00', 'USD', '-1.00', 'INR', '0011000000 - DBS BANK LTD', '1', 'MO: Match & Release', '', '', 'DAIRY', '63,254.68']
  for (const [i, v] of Object.entries(over)) row[Number(i)] = v
  return row
}
const sheet = [
  ['View List of All Transactions'],
  [],
  head,
  leg('1', 'D2', { 0: '12/29/26', 13: 'FO: NDF Fixing' }),
  leg('1', 'D1'),
  ['', '', '', '1', '', '', '', '0'],
  leg('2', 'DSS1', { 17: '0', 7: '-24,900.00' }),
]

describe('demo deals', () => {
  it('reads dates as month/day/year', () => {
    strictEqual(isoDate('11/9/27'), '2027-11-09')
    strictEqual(isoDate('1/1/26'), '2026-01-01')
    strictEqual(isoDate('x'), '')
  })
  it('makes one Deal ID per deal, described by its D1 leg and ending on its latest date', () => {
    const d = parseDealDump(sheet)
    deepStrictEqual(d.dealIds.map((r) => r['ZDEAL_ID']), ['1', '2'])
    const one = d.dealIds[0]!
    strictEqual(one['ZE_DATE'], '2026-12-29')
    strictEqual(one['ZDEAL_AMT'], '10000000.00')
    strictEqual(one['ZPL'], '63254.68')
    strictEqual(one['ZTSF_MODEL'], 'M032')
    strictEqual(d.dealIds[1]!['ZDEAL_AMT'], '24900.00')
    strictEqual(d.skipped, 1)
  })
  it('gives each distinct status text a code and each Deal ID a bank', () => {
    const d = parseDealDump(sheet)
    deepStrictEqual(d.statuses.map((s) => s['ZDEAL_SDESC']), ['MO: Match & Release'])
    strictEqual(d.dealIds[0]!['ZDEAL_STAT'], 'D01')
    deepStrictEqual([d.fx[0]!['BUKRS'], d.fx[0]!['RFHA'], d.fx[0]!['KONTRH'], d.fx[0]!['BP_NAME']], ['SG00', 'DEMO1', '0011000000', 'DBS BANK LTD'])
    strictEqual(d.dealIds[0]!['ZRFHA1'], 'DEMO1')
  })
  it('rejects a sheet that is not the dump', () => {
    throws(() => parseDealDump([['a', 'b']]))
  })
  it('saves, replaces on a second import, and clears', () => {
    const store = new SqliteStore(':memory:')
    strictEqual(saveDemoDeals(store, parseDealDump(sheet)), 2)
    strictEqual(saveDemoDeals(store, parseDealDump(sheet)), 2)
    strictEqual(store.collections().find((c) => c.name === 'demo_dealid')?.count, 2)
    strictEqual(clearDemoDeals(store), 2 + 2 + 1)
    strictEqual(store.collections().find((c) => c.name === 'demo_dealid')?.count ?? 0, 0)
  })
})

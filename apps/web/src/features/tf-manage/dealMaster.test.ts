import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildDealMaster, calculateDealAmounts, findDeal } from './dealMaster.ts'

const STRUCTURES = [
  { Ztype: 'SLC', Zdesc: 'Structured LCs', ZsubType: 'DSX' },
  { Ztype: 'FX', Zdesc: 'Foreign Exchange', ZsubType: 'FX1' },
  { Ztype: 'CT', Zdesc: 'Corporate Trade', ZsubType: 'ICFSI' },
]

const STATUSES = [
  { ZSUB_TYPE: 'FX1', ZDEAL_STAT: '01', ZDEAL_SDESC: 'FO: FX Deals Created' },
  { ZSUB_TYPE: 'FX2', ZDEAL_STAT: '01', ZDEAL_SDESC: 'FO: Option Deals Created' },
]

describe('buildDealMaster', () => {
  const master = buildDealMaster(
    [
      { ZDEAL_ID: '7000000019', ZSUB_TYPE: 'FX1', ZDEAL_STAT: '01', ZMC_REF: '2000000032' },
      { ZDEAL_ID: '7000000030', ZSUB_TYPE: 'FX2', ZDEAL_STAT: '01', ZMC_REF: '' },
      { ZDEAL_ID: '7000000031', ZSUB_TYPE: 'ICFSI', ZDEAL_STAT: '' },
      { ZDEAL_ID: '', ZSUB_TYPE: 'FX1' },
    ],
    STATUSES,
    STRUCTURES,
    new Map([
      ['7000000019', 1000000],
      ['7000000030', 250000],
      ['7000000031', 10],
    ]),
  )

  it('lists real Deal IDs, newest first, and drops a row with none', () => {
    deepStrictEqual(master.deals.map((d) => d.dealId), ['7000000031', '7000000030', '7000000019'])
  })

  it("gives each deal the structure type its sub type belongs to", () => {
    strictEqual(findDeal(master.deals, '7000000019')?.dealStructure, 'FX')
    strictEqual(findDeal(master.deals, '7000000031')?.dealStructure, 'CT')
  })

  it('reads the status text by sub type + status, so FX1 and FX2 keep their own', () => {
    strictEqual(findDeal(master.deals, '7000000019')?.dealStatusText, 'FO: FX Deals Created')
    strictEqual(findDeal(master.deals, '7000000030')?.dealStatusText, 'FO: Option Deals Created')
    strictEqual(findDeal(master.deals, '7000000031')?.dealStatusText, '')
  })

  it('takes the MC Ref No from the Deal ID', () => {
    strictEqual(findDeal(master.deals, '7000000019')?.mcRefNo, '2000000032')
    strictEqual(findDeal(master.deals, '7000000030')?.mcRefNo, '')
  })

  it('joins the commodity by the parent MC reference, never by array order or the TF commodity', () => {
    const joined = buildDealMaster(
      [{ ZDEAL_ID: '7000000019', ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZMC_REF: '2000000032' }],
      STATUSES, STRUCTURES, new Map([['7000000019', 1000]]),
      [{ ZMC_REF_NO: '2000000099', ZCOMMODITY: 'C108', ZCOM_DESC: 'RICE' },
        { ZMC_REF_NO: '2000000032', ZCOMMODITY: 'C106', ZCOM_DESC: 'WHEAT' }],
    )
    strictEqual(joined.deals[0]?.mcCommodity, 'C106')
    strictEqual(joined.deals[0]?.mcCommodityDescription, 'WHEAT')
    strictEqual(joined.deals[0]?.mcRefNo, '2000000032')
  })

  it('carries the computed amount', () => {
    strictEqual(findDeal(master.deals, '7000000019')?.dealAmount, 1000000)
    strictEqual(findDeal(master.deals, '7000000030')?.dealAmount, 250000)
  })

  it('leaves out a Deal ID that has no amount, without touching the others', () => {
    const partial = buildDealMaster(
      [{ ZDEAL_ID: '1', ZSUB_TYPE: 'FX1' }, { ZDEAL_ID: '2', ZSUB_TYPE: 'FX1' }, { ZDEAL_ID: '3', ZSUB_TYPE: 'FX2' }],
      STATUSES,
      STRUCTURES,
      new Map([['2', 500]]),
    )
    deepStrictEqual(partial.deals.map((d) => [d.dealId, d.dealAmount]), [['2', 500]])
  })

  it('offers each structure type once, with its text', () => {
    deepStrictEqual(master.structures, [
      { key: 'CT', text: 'Corporate Trade' },
      { key: 'FX', text: 'Foreign Exchange' },
      { key: 'SLC', text: 'Structured LCs' },
    ])
  })
})

describe('calculateDealAmounts', () => {
  const link = (dealId: string, transaction: string, dealType = 'D1', companyCode = 'SG03') => ({ companyCode, transaction, dealId, dealType, mcRef: '' })
  const leg = (transaction: string, curr1: string, amt1: number, curr2: string, amt2: number, companyCode = 'SG03') => ({
    companyCode,
    transaction,
    curr1,
    amt1,
    curr2,
    amt2,
  })

  it('is ABS(AMT1) when CURR1 is USD', () => {
    const amounts = calculateDealAmounts([link('D', 'T1')], [leg('T1', 'USD', -1000, 'INR', 83000)])
    strictEqual(amounts.get('D'), 1000)
  })

  it('is ABS(AMT2) when CURR1 is anything else', () => {
    const amounts = calculateDealAmounts([link('D', 'T1')], [leg('T1', 'INR', 83000, 'USD', -1000)])
    strictEqual(amounts.get('D'), 1000)
  })

  it('reads only D1 transactions, not the other deal types of the same Deal ID', () => {
    const amounts = calculateDealAmounts(
      [link('D', 'T2', 'D2'), link('D', 'T1')],
      [leg('T1', 'USD', 500, 'INR', -41500), leg('T2', 'USD', 9000, 'INR', -747000)],
    )
    strictEqual(amounts.get('D'), 500)
  })

  it('matches a leg on company code AND transaction, never the transaction alone', () => {
    const amounts = calculateDealAmounts([link('D', 'T1', 'D1', 'SG03')], [leg('T1', 'USD', 7, 'INR', -581, 'SG01')])
    strictEqual(amounts.has('D'), false)
  })

  it('gives a Deal ID with no served D1 leg no entry, rather than an invented amount', () => {
    const amounts = calculateDealAmounts([link('D', 'T1')], [])
    strictEqual(amounts.has('D'), false)
  })

  it('uses a single transaction when a Deal ID has several, the first by key', () => {
    const amounts = calculateDealAmounts(
      [link('D', 'T2'), link('D', 'T1')],
      [leg('T1', 'USD', 100, 'INR', -8300), leg('T2', 'USD', 900, 'INR', -74700)],
    )
    strictEqual(amounts.get('D'), 100)
  })
})

describe('findDeal', () => {
  it('finds nothing for an unknown or blank Deal ID', () => {
    const { deals } = buildDealMaster([{ ZDEAL_ID: '7000000019' }], [], [], new Map([['7000000019', 1]]))
    strictEqual(findDeal(deals, '10000001'), undefined)
    strictEqual(findDeal(deals, '  '), undefined)
    strictEqual(findDeal(deals, ' 7000000019 ')?.dealId, '7000000019')
  })
})

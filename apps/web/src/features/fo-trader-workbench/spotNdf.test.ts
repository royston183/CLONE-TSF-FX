import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildSpotBody, spotAppFields, type NdfSpotRequest } from './spotNdf.ts'

const req: NdfSpotRequest = {
  bukrs: 'SG03',
  bp: '0660012998',
  source: { bukrs: 'SG03', rfha: '2000000000039' },
  curr1: 'USD',
  curr2: 'INR',
  amt1: -100000,
  amt2: -8000000,
  base: 2,
  bs1: 'Sell',
  rate: 80,
  tradeDate: '',
  ndfDate: '2026-10-09',
  valueDate: '2026-10-12',
  dealType: 'D2',
}
const original = { ValueDate: '2026-10-12', LeadCurrency: 'USD', FollowCurrency: 'INR' } as never

describe('NDF / DNDF settlement spot', () => {
  it('books a 605 spot with both amounts and both rates, as create_spot_ndf does', () => {
    const body = buildSpotBody(req, '12A', original)
    strictEqual(body['TransactionType'], '605')
    strictEqual(body['ProductType'], '12A')
    strictEqual(body['BuyCurrency'], 'INR')
    strictEqual(body['SellCurrency'], 'USD')
    strictEqual(body['TradedCurrency'], 'INR')
    strictEqual(body['BuyAmount'], 8000000)
    strictEqual(body['SellAmount'], 100000)
    strictEqual(body['SwapRate'], 0)
    deepStrictEqual([body['SpotRate'], body['ForwardRate']], [80, 80])
    strictEqual(body['ContractDate'], '2026-10-09') // no trade date: the NDF fixing date
    strictEqual(body['ValueDate'], '2026-10-12')
  })

  it('never sends a blank or dd-mm-yyyy date', () => {
    const body = buildSpotBody({ ...req, ndfDate: '', tradeDate: '09-10-2026', valueDate: '' }, '12A', { LeadCurrency: 'USD', FollowCurrency: 'INR' } as never)
    strictEqual(/^\d{4}-\d{2}-\d{2}$/.test(String(body['ContractDate'])), true)
    strictEqual(body['ValueDate'], body['ContractDate'])
  })

  it('copies the NDF\'s Deal ID data to the spot row, with the NDF as ZTSF_EX_OPT_NO and the spot slot as the deal type', () => {
    const fields = spotAppFields(req, { ZtsfDealID: '7000000035', ZtsfDealDesc: 'Nidhi S', ZtsfMcRefNo: '2000000028', ZtsfDealSq: '2', Ztrcode: 'T01' }, '2026-10-09')
    deepStrictEqual(fields, {
      ZtsfDealID: '7000000035',
      ZtsfDealDesc: 'Nidhi S',
      ZtsfMcRefNo: '2000000028',
      ZtsfDealSq: '2',
      ZtsfExOptNo: '2000000000039',
      Ztrcode: 'T01',
      BlotterDate: '2026-10-09',
      ZtsfDealType: 'DS2',
    })
  })
})

import { ndfFields } from './api.ts'

describe('NDF fixing date and reference in the workbench', () => {
  it('reads NDF_DATE and NDF_REF of the view row for a 631 / 632 transaction', () => {
    deepStrictEqual(ndfFields({ TransactionType: '631', ValueDate: '2026-11-13' }, { NDF_DATE: '2026-11-11', NDF_REF: 'RBI-USDINR' }), { ndfDate: '2026-11-11', ndfRef: 'RBI-USDINR' })
  })
  it('falls back to the value date when the view has no date or no row, and leaves other types blank', () => {
    deepStrictEqual(ndfFields({ TransactionType: '632', ValueDate: '2026-11-13' }, { NDF_DATE: '' }), { ndfDate: '2026-11-13', ndfRef: '' })
    deepStrictEqual(ndfFields({ TransactionType: '631', ValueDate: '2026-11-13' }), { ndfDate: '2026-11-13', ndfRef: '' })
    deepStrictEqual(ndfFields({ TransactionType: '619', ValueDate: '2026-11-13' }, { NDF_DATE: '2026-11-11' }), { ndfDate: '', ndfRef: '' })
  })
})

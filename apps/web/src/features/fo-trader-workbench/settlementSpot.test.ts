import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { SpotPorts } from '../fo-additional-spot-booking/spotCreate.ts'
import type { SpotRow } from '../fo-additional-spot-booking/types.ts'
import { bookSettlementSpot, defaultSpotRate, prepareSettlementSpot } from './settlementSpot.ts'

const leg = { dealId: '7000000052', dealType: 'D1', rfha: '3000000000035', bukrs: 'SG03' }

describe('Settlement Spot (ZSGTSFR_SPOT_CREATE)', () => {
  it('says there is nothing to book when IN_SPOT has no open difference for the deal type', async () => {
    const none = await prepareSettlementSpot(leg, {} as SpotPorts, async () => [])
    strictEqual(!none.ok && none.reason.includes('no open difference'), true)
    // A row that is booked already, or has no difference, is not open.
    const booked = await prepareSettlementSpot(leg, {} as SpotPorts, async () => [
      { ZMOD_ID: 'M033', ZDEAL_ID: leg.dealId, ZDEAL_TYPE: 'D1', ZDSS_TYPE: 'DSS1', ZD_AMT: '100.00', ZSPOT_TXN: '6005000000999' },
      { ZMOD_ID: 'M033', ZDEAL_ID: leg.dealId, ZDEAL_TYPE: 'D1', ZDSS_TYPE: 'DSS1', ZD_AMT: '0.00', ZSPOT_TXN: '' },
    ])
    strictEqual(booked.ok, false)
  })

  it('quotes the default rate for the pair the Create Spot arithmetic uses, from TCURR type M', async () => {
    const asked: string[] = []
    const lookup = async (from: string, to: string, date: string, type: string) => {
      asked.push(`${from}>${to} ${type} ${date}`)
      return 83.2
    }
    const rate = await defaultSpotRate({ currency: 'INR' }, { otherCurrency: 'USD' }, new Date(2026, 9, 12), lookup)
    strictEqual(rate, 83.2)
    deepStrictEqual(asked, ['USD>INR M 2026-10-12'])
    strictEqual(await defaultSpotRate({ currency: 'USD' }, { otherCurrency: 'INR' }, new Date(2026, 9, 12), async () => null), null)
  })

  it('reports a refusal as not created, with the reason', async () => {
    const ports = { readSpotRow: async () => null } as unknown as SpotPorts
    const out = await bookSettlementSpot({ id: 'x', modelId: 'M033', dealId: leg.dealId, dealType: 'D1', dssType: 'DSS1' } as SpotRow, { partner: '400000002', tradeDate: new Date(2026, 10, 10), rate: 83.2 }, ports)
    strictEqual(!out.ok && out.message.includes('no longer exists'), true)
  })
})

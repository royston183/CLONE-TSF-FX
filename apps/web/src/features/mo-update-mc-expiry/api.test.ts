import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MC_STATUS_DUMMY } from '../../shared/fx/status.ts'
import { EXPIRED, IN_USE, expirableRefs, toContract } from './api.ts'
import { eligibleIds, expireContracts, isEligibleForExpiry, loadScreen } from './logic.ts'
import { parseDMY } from './format.ts'

const row = {
  ZMC_REF_NO: '2000000001',
  ZMC_DESC: 'OSIPL_Multi-Commodity_M041_0.011154M',
  ZMC_DATE: '2025-12-07',
  ZSELL: 'DMCC',
  ZBUY: 'OSIPL',
  ZORIGIN: 'OSIPL',
  ZAMT: '11154.00',
  ZCURR: 'USD',
  ZORG_AMT: '66924.00',
  ZOCURR: 'INR',
  ZEX_RATE: '6.0000000',
  ZSHIP_START: '2026-01-01',
  ZSHIP_END: '2026-01-01',
  ZCOMMODITY: 'C001',
  ZCOM_DESC: 'Multi-Commodity',
  ZCOM_DESC_LONG: 'WHEAT, CORN',
  ZENT_ID: 'E026',
  ZENT_DESC: 'OGA-DMCC-OSIPL',
  ZCURR_DESC: 'INR-INR-INR',
  ZPAY_TERMS: 'P01',
  ZMOD_ID: 'M041',
  ZMOD_DESC: 'INR - INR Staggered Call & Put Option',
  ZPOS: 'Mumbai',
  ZPOD: 'Jebel Ali',
  ZMC_STAT: '04',
  ZUTI_AMT: '3000.00',
  ZMO_REMARKS: 'mo',
  ZFO_REMARKS: 'fo',
  ZCREATED_BY: 'TINAKSHAYM',
  ZCREATED_DATE: '2025-12-07',
  ZCREATED_TIME: '21:05:15',
  ZCHANGED_BY: 'ROYSTOND',
  ZCHANGED_DATE: '2025-12-08',
  ZCHANGED_TIME: '09:10:11',
}

const date = (dmy: string) => {
  const d = parseDMY(dmy)
  if (!d) throw new Error(`bad test date ${dmy}`)
  return d
}

describe('toContract', () => {
  it('reads a MAS_CON row into the screen shape', () => {
    deepStrictEqual(toContract(row, MC_STATUS_DUMMY), {
      mcNumber: '2000000001',
      client: 'OSIPL',
      mcReferenceNo: 'OSIPL_Multi-Commodity_M041_0.011154M',
      mcDescription: 'OSIPL_Multi-Commodity_M041_0.011154M',
      mcDate: '07-12-2025',
      seller: 'DMCC',
      buyer: 'OSIPL',
      originEntity: 'OSIPL',
      mcAmount: 11154,
      currency: 'USD',
      mcAmountOrigin: 66924,
      originCurrency: 'INR',
      exchangeRate: 6,
      shipmentStart: '01-01-2026',
      shipmentEnd: '01-01-2026',
      gtCommodity: 'C001',
      commodity: 'Multi-Commodity',
      commodityDescription: 'WHEAT, CORN',
      entityId: 'E026',
      entityString: 'OGA-DMCC-OSIPL',
      currencyString: 'INR-INR-INR',
      paymentTerms: 'P01',
      fxModel: 'M041',
      modelDescription: 'INR - INR Staggered Call & Put Option',
      portOfShipment: 'Mumbai',
      portOfDestination: 'Jebel Ali',
      createdMC: '07-12-2025',
      utilization: 0,
      balanceAmount: 11154,
      days: 0,
      moRemarks: 'mo',
      foRemarks: 'fo',
      enteredBy: 'TINAKSHAYM',
      enteredOn: '07-12-2025',
      entryTime: '21:05:15',
      changedBy: 'ROYSTOND',
      changedOn: '08-12-2025',
      changeTime: '09:10:11',
      status: 'In Use',
      statusCode: '04',
    })
  })

  it('does not take utilization from ZUTI_AMT: ZSGTSFV_FX is not in MySQL', () => {
    const c = toContract(row, MC_STATUS_DUMMY)
    strictEqual(c.utilization, 0)
    strictEqual(c.balanceAmount, c.mcAmount)
  })

  it('keeps In Use and Expired pinned to 04 and 09 whatever MC_STAT says', () => {
    const migrated = [
      { code: '04', text: 'Utilised' },
      { code: '09', text: 'MC Expired' },
      { code: '03', text: 'Confirmed by MO' },
    ]
    strictEqual(toContract(row, migrated).status, 'In Use')
    strictEqual(toContract({ ...row, ZMC_STAT: '09' }, migrated).status, 'Expired')
    strictEqual(toContract({ ...row, ZMC_STAT: '03' }, migrated).status, 'Confirmed by MO')
    strictEqual(toContract({ ...row, ZMC_STAT: '77' }, migrated).status, '77')
  })

  it('blank dates and amounts read as empty and zero', () => {
    const c = toContract({ ZMC_REF_NO: '2000000002', ZSHIP_END: null, ZAMT: null, ZMC_STAT: '04' }, MC_STATUS_DUMMY)
    strictEqual(c.shipmentEnd, '')
    strictEqual(c.mcAmount, 0)
    strictEqual(isEligibleForExpiry(c, date('01-01-2030')), false)
  })

  it('feeds the screen filter: In Use and shipment end on or before the Key Date', () => {
    const list = [
      toContract(row, MC_STATUS_DUMMY),
      toContract({ ...row, ZMC_REF_NO: '2000000002', ZSHIP_END: '2025-12-31' }, MC_STATUS_DUMMY),
      toContract({ ...row, ZMC_REF_NO: '2000000003', ZSHIP_END: '2026-01-02' }, MC_STATUS_DUMMY),
      toContract({ ...row, ZMC_REF_NO: '2000000004', ZMC_STAT: '09' }, MC_STATUS_DUMMY),
    ]
    deepStrictEqual(eligibleIds(list, date('01-01-2026')), ['2000000001', '2000000002'])
  })
})

describe('expiry', () => {
  const inUse = toContract(row, MC_STATUS_DUMMY)
  const expired = toContract({ ...row, ZMC_REF_NO: '2000000009', ZMC_STAT: EXPIRED }, MC_STATUS_DUMMY)
  const confirmed = toContract({ ...row, ZMC_REF_NO: '2000000003', ZMC_STAT: '03' }, MC_STATUS_DUMMY)

  it('writes only the MCs stored at 04', () => {
    strictEqual(IN_USE, '04')
    deepStrictEqual(
      expirableRefs([inUse, expired, confirmed], ['2000000001', '2000000009', '2000000003', '2999999999']),
      ['2000000001'],
    )
  })

  it('moves the code to 09 with the text once expired on screen', () => {
    const [c] = expireContracts([inUse], ['2000000001'])
    strictEqual(c?.status, 'Expired')
    strictEqual(c?.statusCode, '09')
    deepStrictEqual(expirableRefs(c ? [c] : [], ['2000000001']), [])
  })

  it('posts every eligible MySQL row and leaves seed rows without a code', () => {
    const result = loadScreen([inUse, expired], date('01-01-2026'), 'post')
    strictEqual(result.posted, 1)
    strictEqual(result.contracts[0]?.statusCode, '09')
    strictEqual(result.contracts[1]?.statusCode, '09')
    const seedLike = { ...inUse }
    delete seedLike.statusCode
    strictEqual('statusCode' in (expireContracts([seedLike], [inUse.mcNumber])[0] ?? {}), false)
  })
})

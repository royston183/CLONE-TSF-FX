import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  actionColumns,
  moRemark,
  statusCodeOf,
  statusFromCode,
  toCommodities,
  toContract,
  toEditColumns,
  toEntities,
  toFxModels,
  toPaymentTerms,
} from './api.ts'
import { ERRCORR_AFTER_DEAL, STATUS } from './data.ts'
import { fmtDate } from './format.ts'
import { applyEdit } from './logic.ts'
import type { MasterContract } from './types.ts'

const row = {
  ZMC_REF_NO: '2000000001',
  ZMC_DESC: 'OSIPL_WHEAT_M032_100K',
  ZMC_DATE: '2026-09-23',
  ZORIGIN: 'OSIPL',
  ZAMT: '100000.00',
  ZCURR: 'USD',
  ZORG_AMT: '9571200.00',
  ZOCURR: 'INR',
  ZEX_RATE: '95.7120000',
  ZSHIP_START: '2026-10-01',
  ZSHIP_END: '2026-10-31',
  ZCOMMODITY: 'C102',
  ZCOM_DESC: 'WHEAT',
  ZENT_ID: 'E015',
  ZENT_DESC: 'OGA-DMCC-OSIPL',
  ZCURR_ID: 'C002',
  ZCURR_DESC: 'USD-USD-INR',
  ZMOD_ID: 'M032',
  ZMOD_DESC: 'INR Long Forward',
  ZMC_STAT: '02',
  ZPAY_TERMS: 'P01',
  ZPAY_TERMS_TEXT: '30 days from B/L date',
  ZPOS: 'Mumbai',
  ZPOD: 'Singapore',
  ZUTI_AMT: '500.00',
  ZMO_REMARKS: '',
  ZFO_REMARKS: 'Corrected rate',
  ZCREATED_BY: 'FOUSER',
  ZCREATED_DATE: '2026-09-22',
  ZCREATED_TIME: '10:15:30',
  ZCHANGED_BY: 'FOUSER',
  ZCHANGED_DATE: '2026-09-23',
  ZCHANGED_TIME: '11:00:00',
}

const mustContract = (r: Record<string, string | null>, dealId = ''): MasterContract => {
  const c = toContract(r, dealId)
  if (!c) throw new Error('row did not map')
  return c
}

describe('status codes', () => {
  it('maps ZMC_STAT to the screen text by code prefix, and back', () => {
    strictEqual(statusFromCode('02'), STATUS.RELEASE)
    strictEqual(statusFromCode('13'), STATUS.ERRCORR)
    strictEqual(statusFromCode('22'), ERRCORR_AFTER_DEAL)
    strictEqual(statusFromCode('03'), STATUS.CONFIRMED)
    strictEqual(statusFromCode('11'), STATUS.REJECTED)
    strictEqual(statusFromCode('01'), undefined)
    strictEqual(statusCodeOf(STATUS.INUSE), '04')
  })
})

describe('toContract', () => {
  it('reads a MAS_CON row into the screen shape', () => {
    const c = mustContract(row, '1200000031')
    strictEqual(c.mcNumber, 2000000001)
    strictEqual(c.status, STATUS.RELEASE)
    strictEqual(c.mcDescription, 'OSIPL_WHEAT_M032_100K')
    strictEqual(c.mcReference, 'MC/OSIPL/2026/001')
    strictEqual(c.dealId, '1200000031')
    strictEqual(c.fxModel, 'M032')
    deepStrictEqual(c.entities, ['OGA', 'DMCC', 'OSIPL'])
    deepStrictEqual(c.currChain, ['USD', 'USD', 'INR'])
    strictEqual(c.entityId, 'E015')
    strictEqual(c.currId, 'C002')
    strictEqual(c.originEntity, 'OSIPL')
    strictEqual(c.commodityDesc, 'WHEAT')
    strictEqual(c.amtUSD, 100000)
    strictEqual(c.amtOrigin, 9571200)
    strictEqual(c.currOrigin, 'INR')
    strictEqual(c.exRate, 95.712)
    strictEqual(fmtDate(c.mcDate), '23-09-2026')
    strictEqual(fmtDate(c.shipEnd), '31-10-2026')
    strictEqual(c.paymentTerms, 'P01')
    strictEqual(c.portOfShipment, 'Mumbai')
    strictEqual(c.portOfDestination, 'Singapore')
    strictEqual(c.foRemarks, 'Corrected rate')
    strictEqual(c.enteredBy, 'FOUSER')
    strictEqual(fmtDate(c.enteredOn), '22-09-2026')
    strictEqual(c.entryTime, '10:15:30')
    strictEqual(c.changedBy, 'FOUSER')
    strictEqual(c.changedOn && fmtDate(c.changedOn), '23-09-2026')
  })

  it('shows no utilization (ZSGTSFV_FX is not in MySQL) and derives the payment date', () => {
    const c = mustContract(row)
    strictEqual(c.utilizedAmt, 0)
    strictEqual(c.balUSD, 100000)
    strictEqual(fmtDate(c.paymentDate), '30-11-2026')
  })

  it('takes the reference year from the MC date and tolerates a blank change stamp', () => {
    const c = mustContract({ ...row, ZMC_DATE: '2027-01-05', ZCHANGED_BY: '', ZCHANGED_DATE: null })
    strictEqual(c.mcReference, 'MC/OSIPL/2027/001')
    strictEqual(c.changedBy, '')
    strictEqual(c.changedOn, null)
  })

  it('reads a resubmitted-correction row with its MO remark, and drops a status it cannot show', () => {
    const c = mustContract({ ...row, ZMC_STAT: '13', ZMO_REMARKS: 'Rate is stale' })
    strictEqual(c.status, STATUS.ERRCORR)
    strictEqual(c.moRemarks, 'Rate is stale')
    strictEqual(mustContract({ ...row, ZMC_STAT: '22' }).status, ERRCORR_AFTER_DEAL)
    strictEqual(toContract({ ...row, ZMC_STAT: '01' }, ''), null)
  })
})

describe('writes', () => {
  it('Confirm writes nothing but the status; Reject adds the remark, clipped to 80', () => {
    deepStrictEqual(actionColumns('confirm', 'ignored'), {})
    deepStrictEqual(actionColumns('reject', '  Wrong port  '), { ZMO_REMARKS: 'Wrong port' })
    strictEqual(moRemark('x'.repeat(100)).length, 80)
  })

  it('an edit writes amount, origin amount, terms and the model with its strings', () => {
    const c = mustContract(row)
    const edited = applyEdit(c, { amount: '2M', paymentTerms: 'P07', fxModel: 'M041' }, new Date(2026, 8, 25))
    deepStrictEqual(toEditColumns(edited), {
      ZAMT: '2000000.00',
      ZORG_AMT: '191424000.00',
      ZPAY_TERMS: 'P07',
      ZPAY_TERMS_TEXT: '60 days from B/L date',
      ZMOD_ID: 'M041',
      ZMOD_DESC: 'INR Short Forward',
      ZENT_ID: 'E017',
      ZENT_DESC: 'OGAT-DMCC-OSIPL',
      ZCURR_ID: 'C002',
      ZCURR_DESC: 'USD-USD-INR',
      ZOCURR: 'INR',
    })
  })
})

describe('masters', () => {
  it('maps COMP, COMODIT and PAYMENT rows', () => {
    deepStrictEqual(toEntities([{ ZCOM_ID: 'OSIPL', ZBUKRS: 'IN11', ZBUTXT: 'Olam Agri India Pvt Ltd', ZREG_ID: 'R02', ZORIGIN: 'X' }]), [
      { code: 'OSIPL', cocode: 'IN11', name: 'Olam Agri India Pvt Ltd', region: 'R02', origin: true },
    ])
    strictEqual(toEntities([{ ZCOM_ID: 'DMCC', ZORIGIN: '' }])[0]?.origin, false)
    deepStrictEqual(toCommodities([{ ZCOM_ID: 'C001', ZCOM_SDESC: 'Multi-Commodity', ZCOM_DESC: 'Multiple Commodities' }]), [
      { code: 'C001', desc: 'Multi-Commodity' },
    ])
    deepStrictEqual(toCommodities([{ ZCOM_ID: 'C102', ZCOM_SDESC: '', ZCOM_DESC: 'WHEAT' }]), [{ code: 'C102', desc: 'WHEAT' }])
    deepStrictEqual(toPaymentTerms([{ ZTERM: 'P01', ZTEXT1: '30 days from B/L date' }]), [{ code: 'P01', desc: '30 days from B/L date' }])
  })

  it('keeps one RULE_BT model per code and currency string', () => {
    const base = { ZMOD_ID: 'M032', ZMOD_DESC: 'INR Long Forward', ZENT_ID: 'E015', ZENT_DESC: 'OGA-DMCC-OSIPL', ZCURR_ID: 'C002', ZCURR_DESC: 'USD-USD-INR' }
    const models = toFxModels([base, { ...base, ZLINK_MODEL: 'L2' }, { ...base, ZCURR_ID: 'C001', ZCURR_DESC: 'INR-INR-INR' }])
    strictEqual(models.length, 2)
    deepStrictEqual(models[0], {
      code: 'M032',
      desc: 'INR Long Forward',
      entities: ['OGA', 'DMCC', 'OSIPL'],
      curr: ['USD', 'USD', 'INR'],
      entityId: 'E015',
      currId: 'C002',
    })
    deepStrictEqual(models[1]?.curr, ['INR', 'INR', 'INR'])
  })
})

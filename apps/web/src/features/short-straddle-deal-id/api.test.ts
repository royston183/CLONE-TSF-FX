import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { dealColumns, documentsByMc, editColumns, toContract, toDeal, toFxModels, tradeCodeFor } from './api.ts'
import { DOC_SOURCE } from './data.ts'
import { applyEdit, computeAmounts, createDeal } from './logic.ts'

const mcRow = {
  ZMC_REF_NO: '2000000007',
  ZMC_DESC: 'MC/OSIPL/2026/007',
  ZMC_DATE: '2026-09-10',
  ZSELL: 'OSIPL',
  ZBUY: '',
  ZORIGIN: 'OSIPL',
  ZAMT: '5000000.00',
  ZCURR: 'USD',
  ZORG_AMT: '415000000.00',
  ZOCURR: 'INR',
  ZEX_RATE: '83.0000000',
  ZSHIP_START: '2026-10-01',
  ZSHIP_END: '2026-12-31',
  ZCOMMODITY: 'C102',
  ZCOM_DESC: 'WHEAT',
  ZENT_ID: 'E040',
  ZENT_DESC: 'OGA-DMCC-OSIPL',
  ZCURR_ID: 'C002',
  ZCURR_DESC: 'USD-USD-INR',
  ZMOD_ID: 'M050',
  ZMOD_DESC: 'INR Short Straddle',
  ZMC_STAT: '03',
  ZPAY_TERMS: 'P01',
  ZPAY_TERMS_TEXT: '30 days from B/L date',
  ZPOS: 'Any Port(s) in India',
  ZPOD: 'Any Port(s) in Middle East',
  ZMO_REMARKS: '',
  ZFO_REMARKS: 'Parcel 1',
  ZCREATED_BY: 'FO_USER',
  ZCREATED_DATE: '2026-09-09',
  ZCREATED_TIME: '10:14:22',
  ZCHANGED_BY: '',
  ZCHANGED_DATE: null,
  ZCHANGED_TIME: '00:00:00',
}

const dealRow = (id: string, stat: string, amt: string) => ({
  ZDEAL_ID: id,
  ZDEAL_TYPE: 'FX',
  ZSUB_TYPE: 'FX1',
  ZDEAL_DESC: 'SIDDHI PATEL_OSIPL_2026/OGA-DMCC-OSIPL',
  ZTSF_MODEL: 'M050',
  ZMC_REF: '2000000007',
  ZS_DATE: '2026-10-01',
  ZE_DATE: '2026-12-31',
  ZDEAL_AMT: amt,
  ZTRD_CODE: '',
  ZDEAL_STAT: stat,
  ZDEAL_CURR_ID: 'C002',
  ZDEAL_CURR_DESC: 'USD-USD-INR',
  ZCREATED_BY: 'MO_USER',
  ZCREATED_DATE: '2026-09-25',
  ZCREATED_TIME: '11:02:03',
})

describe('toFxModels', () => {
  it('keeps Short Straddle rows, one per model, with the entity and currency strings split', () => {
    const models = toFxModels([
      { ZMOD_ID: 'M060', ZSS: 'X', ZMOD_DESC: 'INR SS', ZENT_DESC: 'OGA-DMCC-OSIPL', ZCURR_DESC: 'USD-USD-INR', ZENT_ID: 'E015', ZCURR_ID: 'C002', ZORIGIN: 'OSIPL', ZTYPE: 'FX', ZSUB_TYPE: 'SS1' },
      { ZMOD_ID: 'M060', ZSS: 'X', ZMOD_DESC: 'INR SS (link 2)', ZENT_DESC: 'OGA-OSIPL', ZCURR_DESC: 'USD-INR', ZTYPE: 'FX', ZSUB_TYPE: 'SS2' },
      { ZMOD_ID: 'M032', ZSS: '', ZMOD_DESC: 'INR Long Forward' },
    ])
    deepStrictEqual(models, [
      {
        code: 'M060',
        desc: 'INR SS',
        entities: ['OGA', 'DMCC', 'OSIPL'],
        curr: ['USD', 'USD', 'INR'],
        entityId: 'E015',
        currId: 'C002',
        origin: 'OSIPL',
        dealType: 'FX',
        subType: 'SS1',
      },
    ])
  })
})

describe('toContract', () => {
  it('maps a MAS_CON row to the screen contract', () => {
    const c = toContract(mcRow)
    strictEqual(c.mcRef, 2000000007)
    strictEqual(c.sellBuy, 'S')
    strictEqual(c.origin, 'OSIPL')
    strictEqual(c.amtUSD, 5000000)
    strictEqual(c.amtOrigin, 415000000)
    strictEqual(c.exRate, 83)
    strictEqual(c.origCurr, 'INR')
    strictEqual(c.mcStat, '03')
    strictEqual(c.fxModel, 'M050')
    strictEqual(c.entityDesc, 'OGA-DMCC-OSIPL')
    strictEqual(c.currDesc, 'USD-USD-INR')
    strictEqual(c.payTerms, 'P01')
    strictEqual(c.foRemarks, 'Parcel 1')
    deepStrictEqual(c.mcDate, new Date(2026, 8, 10))
    deepStrictEqual(c.shipEnd, new Date(2026, 11, 31))
    strictEqual(c.createdBy, 'FO_USER')
    strictEqual(c.createdTime, '10:14:22')
    strictEqual(c.changedBy, '')
    strictEqual(c.changedOn, null)
  })

  it('falls back to the derived document date and path when MC_DMS has no row', () => {
    const c = toContract(mcRow)
    deepStrictEqual(c.docDate, new Date(2026, 8, 13))
    strictEqual(c.sourcePath, `${DOC_SOURCE}2000000007_MC.pdf`)
  })

  it('uses the stored document when there is one', () => {
    const c = toContract(mcRow, { docDate: new Date(2026, 8, 11), sourcePath: '\\\\dms\\mc\\7.pdf' })
    deepStrictEqual(c.docDate, new Date(2026, 8, 11))
    strictEqual(c.sourcePath, '\\\\dms\\mc\\7.pdf')
  })

  it('reads a Buy only from a ZBUY without a ZSELL, and a blank ship end as the initial date', () => {
    const c = toContract({ ...mcRow, ZSELL: '', ZBUY: 'DMCC', ZSHIP_END: null })
    strictEqual(c.sellBuy, 'B')
    strictEqual(c.shipEnd.getTime(), new Date(0).getTime())
  })
})

describe('toDeal', () => {
  it('maps a DEALID row and derives the FX legs from the MC, since ZSGTSFV_FX is not in MySQL', () => {
    const mc = toContract(mcRow)
    const d = toDeal(dealRow('12000031', '01', '2000000.00'), mc)
    strictEqual(d.dealId, '12000031')
    strictEqual(d.mcRef, 2000000007)
    strictEqual(d.dealType, 'FX')
    strictEqual(d.subType, 'FX1')
    strictEqual(d.model, 'M050')
    strictEqual(d.amtUSD, 2000000)
    strictEqual(d.dealStat, '01')
    deepStrictEqual(d.sDate, new Date(2026, 9, 1))
    deepStrictEqual([d.curr1, d.curr2, d.amt1, d.amt2], ['USD', 'INR', 2000000, 166000000])
  })

  it('takes the origin currency from the deal currency string when the MC is not loaded', () => {
    const d = toDeal(dealRow('12000031', '01', '10.00'))
    deepStrictEqual([d.curr2, d.amt2], ['INR', 0])
  })

  it('leaves cancelled deals out of the utilized amount', () => {
    const mc = toContract(mcRow)
    const deals = [dealRow('12000031', '01', '2000000.00'), dealRow('12000032', '30', '1000000.00')].map((r) => toDeal(r, mc))
    deepStrictEqual(computeAmounts(mc, deals), { uti: 2000000, bal: 3000000, exp: 0 })
  })
})

describe('documentsByMc', () => {
  it('joins MC_DMS to TSF_DMS for the path, first document per MC', () => {
    const docs = documentsByMc(
      [
        { ZMC_REF_NO: '2000000007', ZDDATE: '2026-09-11', ZDMS_CODE: 'D1', ZSTND_DMS: 'MC' },
        { ZMC_REF_NO: '2000000007', ZDDATE: '2026-09-12', ZDMS_CODE: 'D2', ZSTND_DMS: 'MC' },
        { ZMC_REF_NO: '2000000008', ZDDATE: null, ZDMS_CODE: 'D9', ZSTND_DMS: 'MC' },
      ],
      [
        { ZTSF_DMS_CODE: 'D1', ZSTND_DMS: 'OTHER', ZSOURCE_PATH: '\\\\wrong' },
        { ZTSF_DMS_CODE: 'D1', ZSTND_DMS: 'MC', ZSOURCE_PATH: '\\\\dms\\d1.pdf' },
      ],
    )
    deepStrictEqual(docs.get('2000000007'), { docDate: new Date(2026, 8, 11), sourcePath: '\\\\dms\\d1.pdf' })
    deepStrictEqual(docs.get('2000000008'), { docDate: null, sourcePath: '' })
  })
})

describe('tradeCodeFor', () => {
  const traders = [{ ZTCODE: 'T14', ZTRADER: 'SIDDHI.P', ZNAME: 'Siddhi Patel' }]
  it("is the trader row's ZTCODE for the signed-in user", () => strictEqual(tradeCodeFor(traders, 'SIDDHI.P'), 'T14'))
  it('is blank without a row or a user', () => {
    strictEqual(tradeCodeFor(traders, 'SOMEONE'), '')
    strictEqual(tradeCodeFor(traders, ''), '')
    strictEqual(tradeCodeFor([], 'SIDDHI.P'), '')
  })
})

describe('dealColumns', () => {
  it("writes the new deal with the model's type / sub type, status 01 and ZSS, leaving ZDEAL_ID to the range", () => {
    const mc = toContract(mcRow)
    const { deal } = createDeal(mc, '2M', 0, new Date(2026, 8, 25))
    deepStrictEqual(dealColumns(deal, mc, ''), {
      ZDEAL_TYPE: 'FX',
      ZSUB_TYPE: 'FX1',
      ZDEAL_DESC: 'SIDDHI PATEL_OSIPL_2026/OGA-DMCC-OSIPL',
      ZTSF_MODEL: 'M050',
      ZMC_REF: '2000000007',
      ZS_DATE: '2026-10-01',
      ZE_DATE: '2026-12-31',
      ZDEAL_AMT: '2000000.00',
      ZTRD_CODE: '',
      ZDEAL_STAT: '01',
      ZMC_CURR_ID: 'C002',
      ZMC_CURR_DESC: 'USD-USD-INR',
      ZDEAL_CURR_ID: 'C002',
      ZDEAL_CURR_DESC: 'USD-USD-INR',
      ZSS: 'X',
    })
  })

  it('refuses a deal whose model has no type or sub type, since both are key columns', () => {
    const mc = toContract(mcRow)
    const { deal } = createDeal(mc, '2M', 0, new Date(2026, 8, 25))
    throws(() => dealColumns({ ...deal, subType: '' }, mc, ''), /ZSUB_TYPE/)
  })
})

describe('editColumns', () => {
  it('writes the amount, payment terms and model-derived columns of an edited contract', () => {
    const mc = toContract({ ...mcRow, ZMC_STAT: '01' })
    const edited = applyEdit(mc, { amount: '6M', payTerms: 'P07', model: 'M050' }, new Date(2026, 8, 25))
    deepStrictEqual(editColumns(edited), {
      ZAMT: '6000000.00',
      ZORG_AMT: '498000000.00',
      ZPAY_TERMS: 'P07',
      ZPAY_TERMS_TEXT: '60 days from B/L date',
      ZMOD_ID: 'M050',
      ZMOD_DESC: 'INR Short Straddle',
      ZENT_ID: 'E040',
      ZENT_DESC: 'OGA-DMCC-OSIPL',
      ZCURR_ID: 'C002',
      ZCURR_DESC: 'USD-USD-INR',
      ZOCURR: 'INR',
    })
  })
})

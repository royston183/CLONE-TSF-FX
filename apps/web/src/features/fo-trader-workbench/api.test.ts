import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { TXN_WAITING, dealFromRows, inSpotFromRow, invertedDate, isoFromInverted, loadDealTxns, lookupsFrom, txnFromFx, type Masters } from './api.ts'
import { emptyLookups } from './data.ts'
import type { FxTransaction } from '../mo-fx-deal-confirmation/api.ts'
import type { TrmFxApp } from '../../shared/fx/app-str.ts'

// Row shapes as the SLC middleware served them on 2026-10-01.

describe('FETCH_DEAL_DETAILS mapping', () => {
  const deal = {
    ZDEAL_ID: '7000000006', ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_DESC: 'OSIPL_FX_2026 / OGA-DMCC-OSIPL', ZFX_INV_MODEL: '',
    ZS_DATE: '2026-09-30', ZE_DATE: '2026-10-30', ZMC_REF: '2000000005', ZTRD_CODE: 'T01', ZREGION_ID: 'R02', ZDEAL_REF: '',
    ZTSF_MODEL: 'M099', ZDEAL_STAT: '01', ZSS: '', ZPL: '0.00', ZPL_CURR: '', ZPL_RATE: '0.0000000', ZPL_LAMT: '0.00', ZPL_LCURR: '',
    ZMC_CURR_DESC: 'USD-USD-INR', ZDEAL_CURR_DESC: 'USD-USD-INR',
  }
  const mc = { ZMC_REF_NO: '2000000005', ZORIGIN: 'OSIPL', ZMOD_ID: 'M032', ZMC_DATE: '2026-09-29', ZAMT: '1000000.00', ZCURR: 'USD' }

  it('takes the model, origin and amount from the MC, the rest from ZSGTSFTR_DEALID', () => {
    const d = dealFromRows(deal, mc)
    deepStrictEqual(
      [d.id, d.status, d.model, d.origin, d.mcAmt, d.mcAmtCurr, d.region, d.trader, d.mcCurr, d.start, d.end],
      ['7000000006', '01', 'M032', 'OSIPL', 1000000, 'USD', 'R02', 'T01', 'USD-USD-INR', '2026-09-30', '2026-10-30'],
    )
  })

  it('falls back to ZTSF_MODEL when the MC has no model or is missing (LEFT OUTER JOIN)', () => {
    strictEqual(dealFromRows(deal, { ...mc, ZMOD_ID: '' }).model, 'M099')
    const orphan = dealFromRows(deal, undefined)
    deepStrictEqual([orphan.model, orphan.origin, orphan.mcAmt], ['M099', '', 0])
  })

  it('maps an IN_SPOT row, keeping ZRFHA and the spot number as SAP holds them', () => {
    const s = inSpotFromRow({
      ZDEAL_ID: '1100000981', ZDEAL_TYPE: 'D1', ZDSS_TYPE: 'DSS1', ZBUKRS: 'IN11', ZRFHA: '6205000000288', ZF_AMT: '4998.00',
      ZFX_AMT: '1000.00', ZCURR: 'USD', ZD_AMT: '-3998.00', ZBS: 'Buy', ZSBUKRS: 'OSIPL', ZSPOT_TXN: '6005000000281', ZSPOT_CREATE: 'X', ZEXPIRY: '',
    })
    deepStrictEqual([s.rfha, s.spotTxn, s.dAmt, s.spotCreate, s.dssType], ['6205000000288', '6005000000281', -3998, 'X', 'DSS1'])
  })
})

describe('value helps', () => {
  const m: Masters = {
    comp: [
      { ZBUKRS: 'SG03', ZCOM_ID: 'OGA', ZBUTXT: 'Olam Global Agri' },
      { ZBUKRS: '', ZCOM_ID: 'OSL', ZBUTXT: 'Olam Shanghai' },
      { ZBUKRS: 'AE13', ZCOM_ID: 'DMCC', ZBUTXT: 'Olam DMCC' },
    ],
    models: [
      { ZMOD_ID: 'M041', ZMOD_DESC: 'INR Staggered', ZSUB_TYPE: 'FX2' },
      { ZMOD_ID: 'M041', ZMOD_DESC: 'INR Staggered', ZSUB_TYPE: 'FX1' },
      { ZMOD_ID: 'M032', ZMOD_DESC: 'INR Long Forward', ZSUB_TYPE: 'FX1' },
    ],
    statuses: [
      { ZSUB_TYPE: 'FX1', ZDEAL_STAT: '22', ZDEAL_SDESC: 'Settlement Completed - Accounting' },
      { ZSUB_TYPE: 'FX1', ZDEAL_STAT: '01', ZDEAL_SDESC: 'FO: FX Deals Created' },
      { ZSUB_TYPE: 'FX2', ZDEAL_STAT: '01', ZDEAL_SDESC: 'FO: Option Deals Created' },
    ],
    bpGrp: [
      { BP: '0660012171', ZGRP: 'G02' },
      { BP: '0220136244', ZGRP: 'G02' },
      { BP: '0999999999', ZGRP: 'G02' }, // not in BPEXT
    ],
    bpext: [
      { BP: '0660012171', SHORT_NAME: 'ANZ_SG' },
      { BP: '0220136244', SHORT_NAME: 'MUFG_IN' },
    ],
    trdwai: [
      { ZSFHAART: '645', ZTEXT_CODE: '01', ZACT_TEXT: 'Exercise and Create Spot' },
      { ZSFHAART: '645', ZTEXT_CODE: '', ZACT_TEXT: 'ignored' },
    ],
    ssSpot: [{ ZMOD_ID: 'M041', ZOP_BS: '01', ZPC: '1', ZBS1: '02', ZCURR1: 'USD', ZBS2: '01', ZCURR2: 'INR' }],
    tcurf: [{ FCURR: 'VND', TCURR: 'USD', FFACT: '100', TFACT: '1' }],
  }
  const l = lookupsFrom(m)

  it('Co. Code: ZSGTSFTR_COMP WHERE zbukrs <> space, by code, keeping the entity for the default', () => {
    deepStrictEqual(l.companies, [
      { code: 'AE13', name: 'Olam DMCC', entity: 'DMCC' },
      { code: 'SG03', name: 'Olam Global Agri', entity: 'OGA' },
    ])
  })

  it("BP: ZSGTRMTR_BP_GRP ⋈ ZSGTRMTR_BPEXT (inner join), SHORT_NAME as text, leading zeros kept", () => {
    deepStrictEqual(l.bps, [
      { bp: '0220136244', name: 'MUFG_IN', grp: 'G02' },
      { bp: '0660012171', name: 'ANZ_SG', grp: 'G02' },
    ])
  })

  it('Deal Status at sub type FX1; settlement-completed statuses count as closed', () => {
    deepStrictEqual(l.dealStatus.map((s) => [s.code, s.closed]), [['01', false], ['22', true]])
  })

  it("Model once per id, and RULE_BT's first row decides the sub type", () => {
    deepStrictEqual(l.models.map((x) => x.id), ['M032', 'M041'])
    strictEqual(l.ruleBt['M041'], 'FX2')
  })

  it('TRDWAI without blank codes, SS_SPOT 01 = Buy, TCURF by pair', () => {
    deepStrictEqual(l.actionTexts, [{ sf: '645', code: '01', text: 'Exercise and Create Spot' }])
    deepStrictEqual(l.ssSpot[0], { model: 'M041', opBs: '01', pc: '1', bs1: 'Sell', curr1: 'USD', bs2: 'Buy', curr2: 'INR' })
    deepStrictEqual(l.tcurf['VND>USD'], { ffact: 100, tfact: 1 })
  })
})

describe('TCURR dates', () => {
  it('inverts GDATU both ways', () => {
    strictEqual(invertedDate('2026-10-01'), '79738998') // 99999999 - 20261001
    strictEqual(isoFromInverted('79739069'), '2026-09-30') // 99999999 - 79739069 = 20260930
    strictEqual(isoFromInverted(invertedDate('2026-10-01')), '2026-10-01')
  })
})

describe('FETCH_TXN_DATA from TrmFxApp + FxTransaction', () => {
  const FX: FxTransaction = {
    CompanyCode: 'IN11', FinancialTransaction: '3000000000004', ProductType: '12B', TransactionType: '619', Partner: '0220136244',
    ContractDate: '2026-10-01', ValueDate: '2026-12-01', BuyCurrency: 'USD', SellCurrency: 'INR', LeadCurrency: 'USD',
    FollowCurrency: 'INR', BuyAmount: 100000, SellAmount: 9600000, SpotRate: 95.5, SwapRate: 0.5, ForwardRate: 96, ActiveStatus: '0',
  }
  const APP: TrmFxApp = {
    CompanyCode: 'IN11', FinancialTransaction: '3000000000004', ZtsfDealID: '7000000024', ZtsfDealType: 'D1', ZtsfMcRefNo: '2000000033', TxnStatus: '03',
  }

  it('maps the transaction field for field; the sell side is negative; unserved fields stay blank', () => {
    const l = emptyLookups()
    l.bps = [{ bp: '0220136244', name: 'MUFG_IN', grp: 'G02' }]
    l.companies = [{ code: 'IN11', name: 'Olam India', entity: 'OIL' }]
    const t = txnFromFx({ fx: FX, app: APP }, l)
    deepStrictEqual(
      [t.dealId, t.rfha, t.bukrs, t.sfhaart, t.sgsart, t.dealType, t.cpty, t.cptyName, t.entity, t.tradeDate, t.valueDate],
      ['7000000024', '3000000000004', 'IN11', '619', '12B', 'D1', '0220136244', 'MUFG_IN', 'OIL', '2026-10-01', '2026-12-01'],
    )
    deepStrictEqual(
      [t.bs1, t.curr1, t.amt1, t.bs2, t.curr2, t.amt2, t.ospot, t.oswap, t.rate, t.status, t.mcRef, t.cpair],
      ['Buy', 'USD', 100000, 'Sell', 'INR', -9600000, 95.5, 0.5, 96, '03', '2000000033', 'USD/INR'],
    )
    deepStrictEqual([t.grp, t.ndfRef, t.pc1, t.strike, t.settlfl], ['', '', '', 0, ''])
  })

  describe('read', () => {
    const realFetch = globalThis.fetch
    let urls: string[] = []
    beforeEach(() => {
      urls = []
      globalThis.fetch = (async (input: unknown) => {
        const url = String(input instanceof Request ? input.url : input)
        urls.push(url)
        const value = url.includes('trmfxapp') ? [APP] : url.includes('/fx/') ? [FX, { ...FX, ActiveStatus: '3', FinancialTransaction: '9' }] : []
        return new Response(JSON.stringify({ value }), { status: 200, headers: { 'content-type': 'application/json' } })
      }) as typeof fetch
    })
    afterEach(() => {
      globalThis.fetch = realFetch
    })

    it('asks TrmFxApp for the listed Deal IDs only and skips the network when there are none', async () => {
      const txns = await loadDealTxns(['7000000024', '7000000023', ''], emptyLookups())
      deepStrictEqual(txns.map((t) => t.rfha), ['3000000000004'])
      const q = decodeURIComponent((urls.find((u) => u.includes('trmfxapp')) ?? '').replace(/[+]/g, ' '))
      strictEqual(q.includes("ZtsfDealID eq '7000000024' or ZtsfDealID eq '7000000023'"), true)
      urls = []
      deepStrictEqual(await loadDealTxns([], emptyLookups()), [])
      strictEqual(urls.length, 0)
    })
  })

  it('keeps the option gap in the note shown for a deal without FX transactions', () => {
    strictEqual(TXN_WAITING.includes('ZSGTSFCDS_OPTION'), true)
  })
})

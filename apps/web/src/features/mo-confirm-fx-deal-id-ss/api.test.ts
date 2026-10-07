import { deepStrictEqual, match, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { FxRow } from '../../shared/fx/mw.ts'
import type { TrmFxApp } from '../../shared/fx/app-str.ts'
import type { FxTransaction } from '../mo-fx-deal-confirmation/api.ts'
import { loadFxWithApp } from '../../shared/fx/app-str.ts'
import {
  FX_F4_COLUMNS,
  LEG_APP_FILTER,
  legsByDeal,
  toLeg,
  planInvoices,
  replacementsWaitingReason,
  legsWaitingReason,
  statusOptions,
  toDeal,
  unwindAuthorized,
  type PlanInput,
} from './api.ts'
import { CUR_STR, DEAL_ROW, ENT_STR, MC_ROW, RULES, STATUS_ROWS, TSFV_FX_COLUMNS, masters } from './fixtures.ts'

describe('status list box (FORM drop_down)', () => {
  it('"stat - sdesc" for every non-blank status, one per key, sorted by key', () => {
    deepStrictEqual(statusOptions(STATUS_ROWS), [
      { key: '01', text: '01 - FO: FX Deals Created' },
      { key: '30', text: '30 - Deal ID Cancelled' },
    ])
  })
})

describe('FX legs (TrmFxApp + FxTransaction)', () => {
  const fx = (o: Partial<FxTransaction> = {}): FxTransaction => ({
    CompanyCode: 'SG03', FinancialTransaction: '5000456830', ProductType: '12D', TransactionType: '100', Partner: 'BARC',
    ContractDate: '2026-09-15', ValueDate: '2027-09-18', BuyCurrency: 'USD', SellCurrency: 'INR', LeadCurrency: 'USD',
    FollowCurrency: 'INR', BuyAmount: '1000', SellAmount: '90000', ForwardRate: '90', ActiveStatus: '0', ...o,
  })
  const app = (o: Partial<TrmFxApp> = {}): TrmFxApp => ({
    CompanyCode: 'SG03', FinancialTransaction: '5000456830', ZtsfDealID: '7000000011', ZtsfDealType: 'D1',
    ZtsfMcRefNo: '2000000008', TxnStatus: '07', ...o,
  })

  it('maps a leg: deal type / MC ref / status from APP_STR, signed amounts and rate from SAP, P&L left blank', () => {
    const l = toLeg({ fx: fx(), app: app() })
    strictEqual(l.dealType, 'D1')
    strictEqual(l.mcRef, '2000000008')
    strictEqual(l.txnStatus, '07')
    strictEqual(l.bs1, 'Buy')
    strictEqual(l.amt1, 1000)
    strictEqual(l.amt2, -90000)
    strictEqual(l.allInRate, 90)
    strictEqual(l.tradeDate, '15-09-2026')
    strictEqual(l.strike, 0)
  })
  it('a sold lead currency is negative; a missing APP_STR status stays blank', () => {
    const l = toLeg({ fx: fx({ BuyCurrency: 'INR', SellCurrency: 'USD', BuyAmount: '90000', SellAmount: '1000' }), app: app({ TxnStatus: null }) })
    strictEqual(l.bs1, 'Sell')
    strictEqual(l.amt1, -1000)
    strictEqual(l.txnStatus, '')
  })
  it('groups by Deal ID and leaves out reversed transactions', () => {
    const m = legsByDeal([
      { fx: fx(), app: app() },
      { fx: fx({ FinancialTransaction: '2' }), app: app({ FinancialTransaction: '2', ZtsfDealType: 'D2' }) },
      { fx: fx({ FinancialTransaction: '3', ActiveStatus: '3' }), app: app({ FinancialTransaction: '3' }) },
      { fx: fx({ FinancialTransaction: '4' }), app: app({ FinancialTransaction: '4', ZtsfDealID: '' }) },
    ])
    deepStrictEqual(m.get('7000000011')?.map((l) => l.dealType), ['D1', 'D2'])
    strictEqual(m.size, 1)
  })
  it('loadFxWithApp filters TrmFxApp by Deal ID and joins FxTransaction by company + transaction', async () => {
    const urls: string[] = []
    const real = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      urls.push(decodeURIComponent(url.replaceAll('+', ' ')))
      const value = url.includes('trmfxapp') ? [app()] : [fx()]
      return new Response(JSON.stringify({ value }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    try {
      const rows = await loadFxWithApp(LEG_APP_FILTER)
      strictEqual(rows.length, 1)
      ok(urls.some((u) => u.includes("ZtsfDealID ne ''")))
    } finally {
      globalThis.fetch = real
    }
  })
  it('says why the grid is empty: nothing carries the Deal ID, or the read failed', () => {
    strictEqual(legsWaitingReason('FX1', null), 'No FX transaction in ZSGTSFTR_APP_STR carries this Deal ID.')
    match(legsWaitingReason('FX2', null), /option legs \(ZSGTSFCDS_OPTION\) are not served/)
    match(legsWaitingReason('FX1', 'boom'), /^WAITING FOR API .* could not be read: boom/)
  })
})

describe('WAITING FOR API gates', () => {
  it('New Transaction F4 (ZSGTSFV_FX) waits for TXN_STATUS', () => {
    strictEqual(replacementsWaitingReason(TSFV_FX_COLUMNS), 'WAITING FOR API — ZSGTSFV_FX (middleware "tsfvFx") does not serve TXN_STATUS.')
    strictEqual(replacementsWaitingReason([...FX_F4_COLUMNS]), '')
  })
})

describe('TVARVC ZSGTSF_UNWIND', () => {
  it('authorises only an I/EQ row for the signed-in user', () => {
    const rows = [{ NAME: 'ZSGTSF_UNWIND', SIGN: 'I', OPTI: 'EQ', LOW: 'DEMO' }]
    strictEqual(unwindAuthorized(rows, 'DEMO'), true)
    strictEqual(unwindAuthorized(rows, 'OTHER'), false)
    strictEqual(unwindAuthorized([{ SIGN: 'E', OPTI: 'EQ', LOW: 'DEMO' }], 'DEMO'), false)
    strictEqual(unwindAuthorized([], ''), false)
  })
})

describe('toDeal (FORM screen_desc_fields)', () => {
  it('maps the header from DEALID / MAS_CON / TRADER / DEAL_ST', () => {
    const d = toDeal(DEAL_ROW, masters())
    deepStrictEqual(d.key, { ZDEAL_ID: '7000000011', ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1' })
    strictEqual(d.dealRef, 'REF-11')
    strictEqual(d.startDate, '30-09-2026')
    strictEqual(d.endDate, '30-10-2026')
    strictEqual(d.mcRefNo, '2000000008')
    strictEqual(d.mcDesc, 'OSIPL_Multi-Commodity_M035')
    strictEqual(d.mcDate, '15-09-2026')
    strictEqual(d.shipStart, '01-09-2026')
    strictEqual(d.shipEnd, '18-09-2027')
    strictEqual(d.fxModel, 'M035')
    strictEqual(d.fxModelDesc, 'INR-INR-Put & Call Option')
    strictEqual(d.entityString, 'OGA-OSIPL-DMCC')
    strictEqual(d.currString, 'INR-INR-USD')
    strictEqual(d.traderCode, 'T01')
    strictEqual(d.traderDesc, 'Trader One')
    strictEqual(d.status, '01')
    strictEqual(d.statusText, '01 - FO: FX Deals Created')
    strictEqual(d.isSS, false)
    strictEqual(d.noInvoiceModel, false)
    strictEqual(d.reversalAuthorized, false)
    deepStrictEqual(d.legs, [])
    match(d.legsWaiting, /^No FX transaction/)
    // M035 has two RULE_BT rows: the rule row depends on a D3 leg.
    deepStrictEqual(d.invoices, [])
    match(d.invoicesWaiting, /two ZSGTSFTR_RULE_BT rows/)
  })

  it('without an MC model takes ZTSF_MODEL joined to RULE_BT, but SS / no-invoice stay the MC model\'s', () => {
    const mc = { ...MC_ROW, ZMOD_ID: '', ZMOD_DESC: '' }
    const d = toDeal({ ...DEAL_ROW, ZTSF_MODEL: 'M041' }, masters({ mcs: [mc] }))
    strictEqual(d.fxModel, 'M041')
    strictEqual(d.fxModelDesc, 'Short Straddle')
    strictEqual(d.isSS, false)
  })

  it('flags SS and no-invoice from ZSGTSFTR_RULE_BT-ZSS / -ZNO_INV, and shows an unknown status code as itself', () => {
    strictEqual(toDeal(DEAL_ROW, masters({ mcs: [{ ...MC_ROW, ZMOD_ID: 'M041' }] })).isSS, true)
    strictEqual(toDeal(DEAL_ROW, masters({ mcs: [{ ...MC_ROW, ZMOD_ID: 'M050' }] })).noInvoiceModel, true)
    strictEqual(toDeal({ ...DEAL_ROW, ZDEAL_STAT: '99' }, masters()).statusText, '99')
  })

  it('a deal without its MC shows blanks and has no invoice lines', () => {
    const d = toDeal(DEAL_ROW, masters({ mcs: [] }))
    strictEqual(d.mcRefNo, '')
    strictEqual(d.fxModel, 'M035')
    deepStrictEqual(d.invoices, [])
    strictEqual(d.invoicesWaiting, '')
  })
})

const INV_REF: FxRow[] = [
  { ZDEAL_ID: '7000000009', ZTTYPE: 'T1', ZAMT: '1000.00', ZINV_AMT: '90000.00', ZEX_RATE: '89.00000' },
  { ZDEAL_ID: '7000000009', ZTTYPE: 'T2', ZAMT: '1000.00', ZINV_AMT: '91000.00', ZEX_RATE: '91.00000' },
  { ZDEAL_ID: '7000000009', ZTTYPE: 'T3', ZAMT: '0.00', ZINV_AMT: '0.00', ZEX_RATE: '1.50000' },
]

const plan = (over: Partial<PlanInput> = {}): PlanInput => ({
  dealId: '7000000009',
  mcRef: '2000000028',
  mc: { ZENT_ID: 'E01' },
  modelId: 'M033',
  dealCurrId: 'C001',
  origin: 'OSIPL',
  isSS: false,
  rules: RULES,
  entStr: ENT_STR,
  curStr: CUR_STR,
  orgPro: [],
  invRef: INV_REF,
  ...over,
})

describe('planInvoices (FORM invoice_plan)', () => {
  it('builds T1..T3 from ENT_STR / CUR_STR / the model links, amounts from INV_REF, rate = inv / amt', () => {
    const { invoices, waiting } = planInvoices(plan())
    strictEqual(waiting, '')
    deepStrictEqual(invoices, [
      { ttype: 'T1', dtype: 'D1', buy: 'OSIPL', sell: 'OGA', currency: 'INR', exRate: 90, invAmt: 90000, invAmtUsd: 1000,
        trmRef: '7000000009-T1', mcRef: 'OSIPL-OGA-P / OGA-OSIPL-S' },
      { ttype: 'T2', dtype: 'D2', buy: 'DMCC', sell: 'OSIPL', currency: 'INR', exRate: 91, invAmt: 91000, invAmtUsd: 1000,
        trmRef: '7000000009-T2', mcRef: 'DMCC-OSIPL-P / OSIPL-DMCC-S' },
      // zero ZAMT: the zero divide leaves ZEX_RATE as read.
      { ttype: 'T3', dtype: '', buy: 'OGA', sell: 'DMCC', currency: 'USD', exRate: 1.5, invAmt: 0, invAmtUsd: 0,
        trmRef: '7000000009-T3', mcRef: 'OGA-DMCC-P / DMCC-OGA-S' },
    ])
  })

  it('no MC: no lines and nothing to wait for', () => {
    deepStrictEqual(planInvoices(plan({ mcRef: '' })), { invoices: [], waiting: '' })
  })

  it('waits for the legs where the ABAP computes from them', () => {
    match(planInvoices(plan({ isSS: true })).waiting, /Short Straddle/)
    match(planInvoices(plan({ invRef: INV_REF.slice(0, 2) })).waiting, /T3 has no ZSGTSFTR_INV_REF row/)
    match(planInvoices(plan({ modelId: 'M035' })).waiting, /two ZSGTSFTR_RULE_BT rows/)
    const fx2 = [{ ZMOD_ID: 'M099', ZSUB_TYPE: 'FX2', ZD1_INV_LINK: '01' }]
    match(planInvoices(plan({ modelId: 'M099', rules: fx2 })).waiting, /FX2 model/)
    ok(planInvoices(plan({ isSS: true })).invoices.length === 0)
  })

  it('FORM profit_margin_check: M001 marks up the D2 lines from the D1 rate', () => {
    const rules = [{ ZMOD_ID: 'M001', ZSUB_TYPE: 'FX1', ZD1_INV_LINK: '01', ZD2_INV_LINK: '02' }]
    const orgPro = [{ ZCOM_ID: 'OSIPL', ZPRO_MARG_INV: '10.00' }]
    const { invoices } = planInvoices(plan({ modelId: 'M001', rules, orgPro }))
    strictEqual(invoices[0]?.exRate, 90)
    strictEqual(invoices[1]?.exRate, 99)
    strictEqual(invoices[1]?.invAmt, 99000)
  })

  it('FORM profit_margin_check: M002 marks down T1; no margin for the origin changes nothing', () => {
    const rules = [{ ZMOD_ID: 'M002', ZSUB_TYPE: 'FX1', ZD1_INV_LINK: '01', ZD2_INV_LINK: '02' }]
    const { invoices } = planInvoices(plan({ modelId: 'M002', rules, orgPro: [{ ZCOM_ID: 'OSIPL', ZPRO_MARG_INV: '10' }] }))
    strictEqual(invoices[0]?.exRate, 81)
    strictEqual(invoices[0]?.invAmt, 81000)
    strictEqual(planInvoices(plan({ modelId: 'M002', rules, orgPro: [{ ZCOM_ID: 'DMCC', ZPRO_MARG_INV: '10' }] })).invoices[0]?.exRate, 90)
  })
})

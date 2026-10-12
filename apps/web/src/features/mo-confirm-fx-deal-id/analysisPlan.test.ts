import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { FxRow } from '../../shared/fx/mw.ts'
import { rateOfRow } from '../../shared/fx/exchange-rate.ts'
import { dealRow, fake, rec } from './analysisTestKit.ts'
import { confirmPrepared, pickCurrencyString, prepareConfirmation, type PlanPorts } from './analysisConfirm.ts'
import { applyProfitMargin, buildInvoicePlan, buildPnl, fxSummaryPl, fxSummaryRow, linkedLeg, persistedPl, pnlRateRequest, usdSideAmount, type PlanInput, type PlanLeg } from './analysisPlan.ts'
import type { Leg } from './types.ts'

const RULE: FxRow = { ZMOD_ID: 'M033', ZSUB_TYPE: 'FX1', ZD1_INV_LINK: '01', ZD1_INV_LINK2: '', ZD2_INV_LINK: '02', ZD2_INV_LINK2: '03', ZD1_ADJ: '', ZD2_ADJ: '' }
const ENT: FxRow = { ZENT_ID: 'E1', ZENT1: 'OGA', ZENT2: 'OSIPL', ZENT3: 'DMCC' }
const CUR: FxRow = { ZCURR_ID: 'C1', ZCURR1: 'INR', ZCURR2: 'INR', ZCURR3: 'USD' }

const d1: PlanLeg = { dealType: 'D1', rfha: '100001', curr1: 'USD', curr2: 'INR', fromCurrency: 'USD', toCurrency: 'INR', amt1: 20000, amt2: -1664000, allIn: 83.2, strike: 0, preAmt: 0, start: '2026-10-06' }
const d2: PlanLeg = { dealType: 'D2', rfha: '100002', curr1: 'USD', curr2: 'INR', fromCurrency: 'USD', toCurrency: 'INR', amt1: -20000, amt2: 1670000, allIn: 83.5, strike: 0, preAmt: 0, start: '2026-10-08' }

const input = (over: Partial<PlanInput> = {}): PlanInput => ({
  dealId: '7000000023',
  modelId: 'M033',
  rule: RULE,
  entityString: ENT,
  currencyString: CUR,
  profitMargin: 0,
  existing: [],
  legs: [d1, d2],
  ...over,
})

const line = (r: ReturnType<typeof buildInvoicePlan>, t: string) => r.lines.find((l) => l.ZTTYPE === t)!

describe('FX Deal P&L summary (ALV1_SUB_TOTAL / UPDATE_INV_REF)', () => {
  it('sums the non-USD side of USD legs, absolute, and derives the USD side from the lead-pair rate', () => {
    const row = fxSummaryRow([d1, d2])!
    deepStrictEqual([row.amt1, row.amt2, row.lead, row.foreign, row.date], [0, 6000, 'USD', 'INR', '2026-10-06'])
    const pl = fxSummaryPl([d1, d2], 83.2, 83.2)!
    strictEqual(pl.localCurrency, 'INR')
    strictEqual(pl.localAmount, 6000)
    strictEqual(Math.round(pl.pl * 100) / 100, 72.12)
    strictEqual(pl.rate, 83.2)
  })

  it('stores AMT2 / AMT1 the other way round when the first leg is not USD-first', () => {
    const e1: PlanLeg = { ...d1, curr1: 'INR', curr2: 'USD', amt1: -1664000, amt2: 20000 }
    const e2: PlanLeg = { ...d2, curr1: 'INR', curr2: 'USD', amt1: 1670000, amt2: -20000 }
    const pl = fxSummaryPl([e1, e2], 83.2, 83.2)!
    // AMT1 = |sum of INR| = 6000, AMT2 = AMT1 / rate; ZPL takes AMT2 (USD), ZPL_LAMT takes AMT1.
    strictEqual(pl.localAmount, 6000)
    strictEqual(pl.localCurrency, 'INR')
    strictEqual(Math.round(pl.pl * 100) / 100, 72.12)
  })

  it('is undefined without a D1 / D2 leg or a usable rate', () => {
    strictEqual(fxSummaryPl([], 83.2, 83.2), undefined)
    strictEqual(fxSummaryPl([d1, d2], 0, 83.2), undefined)
  })
})

describe('invoice plan rows', () => {
  it('builds T1 / T2 / T3 from the entity and currency strings with deterministic references', () => {
    const r = buildInvoicePlan(input())
    deepStrictEqual(r.problems, [])
    deepStrictEqual(r.lines.map((l) => l.ZINV_TRM_NO), ['7000000023-T1', '7000000023-T2', '7000000023-T3'])
    const [t1, t2, t3] = r.lines
    deepStrictEqual([t1!.ZTRD_SELL, t1!.ZTRD_BUY, t1!.ZTRD_CURR, t1!.ZMC_REF_P, t1!.ZMC_REF_S], ['OGA', 'OSIPL', 'INR', 'OSIPL-OGA-P', 'OGA-OSIPL-S'])
    deepStrictEqual([t2!.ZTRD_SELL, t2!.ZTRD_BUY, t2!.ZTRD_CURR, t2!.ZMC_REF_P, t2!.ZMC_REF_S], ['OSIPL', 'DMCC', 'INR', 'DMCC-OSIPL-P', 'OSIPL-DMCC-S'])
    deepStrictEqual([t3!.ZTRD_SELL, t3!.ZTRD_BUY, t3!.ZTRD_CURR, t3!.ZMC_REF_P, t3!.ZMC_REF_S], ['DMCC', 'OGA', 'USD', 'OGA-DMCC-P', 'DMCC-OGA-S'])
  })

  it('maps the currency string to the three trades', () => {
    const r = buildInvoicePlan(input({ currencyString: { ZCURR_ID: 'C2', ZCURR1: 'EUR', ZCURR2: 'GBP', ZCURR3: 'INR' } }))
    deepStrictEqual(r.lines.map((l) => l.ZTRD_CURR), ['EUR', 'GBP', 'INR'])
  })

  it('links each trade to D1 or D2 from the model, not all to D1', () => {
    strictEqual(linkedLeg(RULE, '01'), 'D1')
    strictEqual(linkedLeg(RULE, '02'), 'D2')
    strictEqual(linkedLeg(RULE, '03'), 'D2') // ZD2_INV_LINK2
    strictEqual(linkedLeg({ ...RULE, ZD1_INV_LINK2: '03', ZD2_INV_LINK2: '' }, '03'), 'D1')
    strictEqual(linkedLeg(RULE, '09'), '')
    const r = buildInvoicePlan(input())
    deepStrictEqual(r.lines.map((l) => l.ZDTYPE), ['D1', 'D2', 'D2'])
  })

  it('reports a trade linked to a leg the Deal ID does not have, and a missing master', () => {
    ok(buildInvoicePlan(input({ legs: [d1] })).problems.some((p) => p.includes('no D2 transaction')))
    ok(buildInvoicePlan(input({ currencyString: undefined })).problems.some((p) => p.includes('ZSGTSFTR_CUR_STR')))
    ok(buildInvoicePlan(input({ entityString: undefined })).problems.some((p) => p.includes('ZSGTSFTR_ENT_STR')))
    ok(buildInvoicePlan(input({ rule: undefined })).problems.some((p) => p.includes('ZSGTSFTR_RULE_BT')))
  })

  it('leaves out T2 / T3 when the entity string has fewer entities', () => {
    const r = buildInvoicePlan(input({ entityString: { ENT_ID: 'x', ZENT1: 'OGA', ZENT2: 'OSIPL', ZENT3: '' } }))
    deepStrictEqual(r.lines.map((l) => l.ZTTYPE), ['T1'])
  })
})

describe('invoice values', () => {
  it('uses the all-in rate, and the strike before it when the leg has one', () => {
    strictEqual(line(buildInvoicePlan(input()), 'T1').ZEX_RATE, 83.2)
    const withStrike = buildInvoicePlan(input({ legs: [{ ...d1, strike: 82.9 }, d2] }))
    strictEqual(line(withStrike, 'T1').ZEX_RATE, 82.9)
    strictEqual(line(withStrike, 'T2').ZEX_RATE, 83.5) // D2 has no strike
  })

  it('ZINV_AMT = ZAMT * ZEX_RATE, with ZAMT the USD side of the leg', () => {
    const t1 = line(buildInvoicePlan(input()), 'T1')
    strictEqual(t1.ZAMT, 20000)
    strictEqual(t1.ZINV_AMT, 1664000)
    strictEqual(usdSideAmount({ ...d1, curr1: 'INR', curr2: 'USD', amt1: -1664000, amt2: 20000 }), 20000)
  })

  it('a USD-currency trade carries rate 1', () => {
    const t3 = line(buildInvoicePlan(input()), 'T3')
    strictEqual(t3.ZEX_RATE, 1)
    strictEqual(t3.ZINV_AMT, t3.ZAMT)
  })

  it('the premium-adjustment rate overrides D2 only', () => {
    const r = buildInvoicePlan(input({ premiumRate: 83.9 }))
    strictEqual(line(r, 'T1').ZEX_RATE, 83.2)
    strictEqual(line(r, 'T2').ZEX_RATE, 83.9)
    strictEqual(line(r, 'T2').ZINV_AMT, 20000 * 83.9)
  })

  it('ZD1_ADJ / ZD2_ADJ add the premium of the linked leg to the amount', () => {
    const legs = [{ ...d1, preAmt: -150 }, { ...d2, preAmt: 40 }]
    const r = buildInvoicePlan(input({ legs, rule: { ...RULE, ZD1_ADJ: 'X' } }))
    strictEqual(line(r, 'T1').ZAMT, 20150)
    strictEqual(line(r, 'T2').ZAMT, 20000)
    const r2 = buildInvoicePlan(input({ legs, rule: { ...RULE, ZD2_ADJ: 'X' } }))
    strictEqual(line(r2, 'T1').ZAMT, 20000)
    strictEqual(line(r2, 'T2').ZAMT, 20040)
  })

  it('reuses the amounts and rate of a saved invoice reference of the same trade type', () => {
    const existing: FxRow[] = [{ ZDEAL_ID: '7000000023', ZTTYPE: 'T1', ZINV_TRM_NO: 'old', ZAMT: '5000', ZEX_RATE: '80', ZINV_AMT: '400000' }]
    const r = buildInvoicePlan(input({ existing }))
    const t1 = line(r, 'T1')
    deepStrictEqual([t1.ZAMT, t1.ZEX_RATE, t1.ZINV_AMT, t1.reused], [5000, 80, 400000, true])
    strictEqual(t1.ZINV_TRM_NO, '7000000023-T1')
    ok(!line(r, 'T2').reused)
  })
})

describe('profit margin', () => {
  it('M001 marks every D2 row up from the D1 rate', () => {
    const r = buildInvoicePlan(input({ modelId: 'M001', profitMargin: 2 }))
    const d1Rate = 83.2
    strictEqual(line(r, 'T1').ZEX_RATE, d1Rate)
    const want = Math.round(((d1Rate * 102) / 100) * 1e7) / 1e7
    strictEqual(line(r, 'T2').ZEX_RATE, want)
    strictEqual(line(r, 'T2').ZINV_AMT, Math.round(20000 * want * 100) / 100)
    strictEqual(line(r, 'T3').ZEX_RATE, want) // T3 is also D2
  })

  it('M002 marks T1 down from the D1 rate', () => {
    const r = buildInvoicePlan(input({ modelId: 'M002', profitMargin: 2 }))
    const want = Math.round(((83.2 * 98) / 100) * 1e7) / 1e7
    strictEqual(line(r, 'T1').ZEX_RATE, want)
    strictEqual(line(r, 'T1').ZINV_AMT, Math.round(20000 * want * 100) / 100)
    strictEqual(line(r, 'T2').ZEX_RATE, 83.5)
  })

  it('applies to no other model, and not at all without a margin', () => {
    const r = buildInvoicePlan(input({ modelId: 'M033', profitMargin: 5 }))
    deepStrictEqual(r.lines.map((l) => l.ZEX_RATE), [83.2, 83.5, 1])
    const lines = buildInvoicePlan(input()).lines
    applyProfitMargin(lines, 'M001', 0)
    deepStrictEqual(lines.map((l) => l.ZEX_RATE), [83.2, 83.5, 1])
  })
})

describe('P&L', () => {
  const lines = buildInvoicePlan(input()).lines

  it('builds sale (local = ZINV_AMT, foreign = ZAMT) and purchase (x -1) per entity and totals them', () => {
    const rows = buildPnl(lines, 83.2)
    const osipl = rows.find((r) => r.entity === 'OSIPL')!
    // OSIPL sells T2 (20000 USD / 1,670,000 INR) and buys T1 (20000 USD / 1,664,000 INR).
    deepStrictEqual([osipl.saleLocal, osipl.saleForeign, osipl.purchaseLocal, osipl.purchaseForeign], [1670000, 20000, -1664000, -20000])
    deepStrictEqual([osipl.plLocal, osipl.plForeign, osipl.premiumIncome, osipl.premiumExpense], [6000, 0, 0, 0])
    strictEqual(osipl.plPercent, Math.round((6000 / 1670000) * 10000) / 100)
  })

  it('includes option premium income and expense in the total', () => {
    const rows = buildPnl(lines, 83.2, { income: { OSIPL: 500 }, expense: { OSIPL: -200 } })
    strictEqual(rows.find((r) => r.entity === 'OSIPL')!.plLocal, 6300)
  })

  it('persists the middle entity row: USD side, non-USD side and currency, with the rate', () => {
    const rows = buildPnl(lines, 83.2)
    deepStrictEqual(persistedPl(rows, ENT, 83.2), { pl: 0, localAmount: 6000, localCurrency: 'INR', rate: 83.2 })
    strictEqual(persistedPl(rows, undefined, 83.2), undefined)
  })

  it('looks the rate up on the earlier of the D1 / D2 start dates for F_CURR1 -> T_CURR1', () => {
    deepStrictEqual(pnlRateRequest([d1, d2]), { from: 'USD', to: 'INR', date: '2026-10-06' })
    deepStrictEqual(pnlRateRequest([d1, { ...d2, start: '2026-10-01' }]), { from: 'USD', to: 'INR', date: '2026-10-01' })
  })

  it('reads TCURR rows, a negative rate being the indirect quotation', () => {
    strictEqual(rateOfRow({ UKURS: '83.2' }), 83.2)
    strictEqual(rateOfRow({ UKURS: '-0.0125' }), 80)
  })
})

// ---------------------------------------------------------------- the whole confirmation

const screenLeg = (over: Partial<Leg>): Leg => ({
  rfha: '100001', bukrs: 'SG03', dealType: 'D1', bpName: '', bpCode: '', dealDate: '06-10-2026', valueDate: '09-11-2026', desc: '',
  bs1: 'Buy', curr1: 'USD', amt1: 20000, bs2: 'Sell', curr2: 'INR', amt2: -1664000, rateVal: 83.2, rateLabel: 'All-in Rate', txnStatus: '07', fxPl: null,
  ...over,
})
const legs = [screenLeg({}), screenLeg({ rfha: '100002', dealType: 'D2', dealDate: '08-10-2026', amt1: -20000, amt2: 1670000, rateVal: 83.5 })]

const planPorts = (over: Partial<PlanPorts> = {}): PlanPorts => ({
  masterContract: async () => ({ ZMC_REF_NO: '2000000028', ZMOD_ID: 'M033', ZENT_ID: 'E1', ZORIGIN: 'OGA' }),
  pickableContracts: async () => [],
  rules: async () => [RULE],
  entityString: async () => ENT,
  currencyStrings: async () => [CUR],
  orgProfit: async () => undefined,
  fxView: async () => undefined,
  exchangeRate: async () => 83.2,
  ...over,
})
const deal = { ZDEAL_CURR_ID: 'C1', ZTSF_MODEL: 'M033' }

describe('currency string lookup', () => {
  const rows: FxRow[] = [{ ZCURR_ID: 'INR-INR-INR', ZCURR1: 'INR' }, { ZCURR_ID: 'USD-USD-INR', ZCURR1: 'USD' }]
  it('uses the Deal ID currency string when ZDEAL_CURR_ID is a code (C001 / INR-INR-INR on Deal ID 7000000023)', () => {
    strictEqual(pickCurrencyString(rows, 'C001', 'INR-INR-INR')?.['ZCURR_ID'], 'INR-INR-INR')
  })
  it('prefers a match on ZDEAL_CURR_ID itself', () => {
    strictEqual(pickCurrencyString(rows, 'USD-USD-INR', 'INR-INR-INR')?.['ZCURR_ID'], 'USD-USD-INR')
  })
  it('finds nothing when neither matches', () => {
    strictEqual(pickCurrencyString(rows, 'C009', 'XXX'), undefined)
  })
})

describe('Change / Confirm end to end', () => {
  it('status 01 with D1 07 and D2 07 is eligible, and nothing is written while preparing', async () => {
    const f = fake({ deal: dealRow(deal), app: [rec('100001'), rec('100002')] })
    const p = await prepareConfirmation('1000000231', legs, '', f.ports, planPorts())
    ok(p.ok)
    deepStrictEqual(f.log, [])
    strictEqual(p.ok && p.lines.length, 3)
  })

  it('is blocked, naming the RFHA, when any linked transaction is below 07', async () => {
    const f = fake({ deal: dealRow(deal), app: [rec('100001'), rec('100002', { TxnStatus: '03' })] })
    const p = await prepareConfirmation('1000000231', legs, '', f.ports, planPorts())
    ok(!p.ok && p.reason.includes('100002'))
  })

  it('is blocked, with its own reason, when the Deal ID is not Created', async () => {
    const f = fake({ deal: dealRow({ ...deal, ZDEAL_STAT: '02' }), app: [rec('100001'), rec('100002')] })
    const p = await prepareConfirmation('1000000231', legs, '', f.ports, planPorts())
    ok(!p.ok && p.reason.includes('status 02'))
  })

  it('names the exchange-rate lookup when TCURR has no rate, instead of disabling the action', async () => {
    const f = fake({ deal: dealRow(deal), app: [rec('100001'), rec('100002')] })
    const p = await prepareConfirmation('1000000231', legs, '', f.ports, planPorts({ exchangeRate: async () => null }))
    ok(!p.ok && p.reason.startsWith('Exchange-rate service unavailable') && p.reason.includes('USD to INR'))
  })

  it('asks TCURR for type M, F_CURR1 -> T_CURR1, on the earlier start date', async () => {
    const asked: unknown[][] = []
    const f = fake({ deal: dealRow(deal), app: [rec('100001'), rec('100002')] })
    await prepareConfirmation('1000000231', legs, '', f.ports, planPorts({ exchangeRate: async (...a) => (asked.push(a), 83.2) }))
    deepStrictEqual(asked[0], ['USD', 'INR', '2026-10-06', 'M'])
  })

  it('refuses option and Short Straddle models with the reason', async () => {
    const f = fake({ deal: dealRow(deal), app: [rec('100001'), rec('100002')] })
    const fx2 = await prepareConfirmation('1000000231', legs, '', f.ports, planPorts({ rules: async () => [{ ...RULE, ZSUB_TYPE: 'FX2' }] }))
    ok(!fx2.ok && fx2.reason.includes('ZSGTSFCDS_OPTION'))
    const ss = await prepareConfirmation('1000000231', legs, '', f.ports, planPorts({ rules: async () => [{ ...RULE, ZSS: 'X' }] }))
    ok(!ss.ok && ss.reason.includes('Short Straddle'))
  })

  it('reuses saved invoice references in the plan', async () => {
    const inv: FxRow[] = [{ ZDEAL_ID: '1000000231', ZTTYPE: 'T1', ZINV_TRM_NO: 'x', ZAMT: '1', ZEX_RATE: '2', ZINV_AMT: '2' }]
    const f = fake({ deal: dealRow(deal), app: [rec('100001'), rec('100002')], inv })
    const p = await prepareConfirmation('1000000231', legs, '', f.ports, planPorts())
    ok(p.ok && p.lines[0]!.reused && p.lines[0]!.ZINV_AMT === 2)
  })

  it('confirming moves the Deal ID 01 -> 02 with ZCONFIRM X and the P&L, and leaves TXN_STATUS alone', async () => {
    const f = fake({ deal: dealRow(deal), app: [rec('100001'), rec('100002')] })
    const p = await prepareConfirmation('1000000231', legs, '', f.ports, planPorts())
    ok(p.ok)
    const r = await confirmPrepared(p, f.ports)
    ok(r.ok)
    strictEqual(f.state.deal['ZDEAL_STAT'], '02')
    strictEqual(f.state.deal['ZCONFIRM'], 'X')
    strictEqual(f.state.deal['ZPL'], '72.12')
    strictEqual(f.state.deal['ZPL_CURR'], 'USD')
    strictEqual(f.state.deal['ZPL_LAMT'], '6000.00')
    strictEqual(f.state.deal['ZPL_LCURR'], 'INR')
    strictEqual(f.state.deal['ZPL_RATE'], '83.20000')
    strictEqual(f.state.deal['ZTSF_MODEL'], 'M033')
    deepStrictEqual(f.state.inv.map((i) => i['ZINV_TRM_NO']), ['1000000231-T1', '1000000231-T2', '1000000231-T3'])
    ok(!f.log.some((l) => l.includes('TxnStatus')))
    strictEqual(f.state.app.get('SG03|100001')!.TxnStatus, '07')
    strictEqual(f.state.app.get('SG03|100002')!.TxnStatus, '07')
  })

  it('revalidates just before writing: a transaction that dropped below 07 after the preview blocks the write', async () => {
    const f = fake({ deal: dealRow(deal), app: [rec('100001'), rec('100002')] })
    const p = await prepareConfirmation('1000000231', legs, '', f.ports, planPorts())
    ok(p.ok)
    f.state.app.set('SG03|100002', { ...f.state.app.get('SG03|100002')!, TxnStatus: '04' })
    const r = await confirmPrepared(p, f.ports)
    ok(!r.ok && r.error!.includes('100002'))
    deepStrictEqual(f.log, [])
    strictEqual(f.state.deal['ZDEAL_STAT'], '01')
  })

  it('a different Master Contract is calculated with its own entity string and then stamped on every linked APP_STR', async () => {
    const f = fake({ deal: dealRow(deal), app: [rec('100001'), rec('100002')] })
    const asked: string[] = []
    const p = await prepareConfirmation('1000000231', legs, '2000000099', f.ports, planPorts({ masterContract: async (ref) => (asked.push(ref), { ZMC_REF_NO: ref, ZMOD_ID: 'M033', ZENT_ID: 'E1', ZORIGIN: 'OGA' }) }))
    deepStrictEqual(asked, ['2000000099'])
    ok(p.ok)
    ok((await confirmPrepared(p, f.ports)).ok)
    strictEqual(f.state.deal['ZMC_REF'], '2000000099')
    strictEqual(f.state.app.get('SG03|100001')!.ZtsfMcRefNo, '2000000099')
    strictEqual(f.state.app.get('SG03|100002')!.ZtsfMcRefNo, '2000000099')
  })
})

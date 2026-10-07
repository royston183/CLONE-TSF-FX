import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AppStrFields } from '../fx-blotter/appStr.ts'
import type { TrmFxApp } from '../../shared/fx/app-str.ts'
import type { FxRow } from '../../shared/fx/mw.ts'
import type { FxTransaction } from '../mo-fx-deal-confirmation/api.ts'
import { MSG, applyBookingEdit, gateEarly, gateRollover, legCurrencies, validateEarly, validateRollover, withInvoiceAmount } from './logic.ts'
import {
  amountOf,
  convertAmount,
  fillMissingAmounts,
  inrInvoiceAmount,
  invoiceAmountRows,
  rateFactor,
  recomputeOnRateChange,
  type InvoiceAmountRow,
} from './calc.ts'
import {
  buildFxBody,
  canResume,
  describeFailure,
  freshProgress,
  runPremature,
  shouldNotifyRollover,
  sendRolloverNotification,
  type OriginalTxn,
  type PairInput,
  type PrematureDeps,
  type TxnRef,
  type UnwindInput,
} from './premature.ts'
import { pickProductType } from './deps.ts'
import {
  cancellationAppFields,
  cancellationInitialStatus,
  cancellationStatusFromParam,
  dealSlotOf,
  foRemarkFields,
  originalFinalStatus,
  originalUpdateFields,
  replacementAppFields,
  slotHolds,
} from './rules.ts'
import type { BookingForm, Leg, PairForm } from './types.ts'

/* ---------------- fixtures ---------------- */

const ORIGINAL: TxnRef = { companyCode: 'SG03', transaction: '1000000123' }
const FX: FxTransaction & Record<string, unknown> = {
  CompanyCode: 'SG03', FinancialTransaction: '1000000123', ProductType: '12B', TransactionType: '619', Partner: 'BP1',
  ContractDate: '2026-08-01', ValueDate: '2026-12-01', BuyCurrency: 'USD', SellCurrency: 'INR', LeadCurrency: 'USD',
  FollowCurrency: 'INR', BuyAmount: 1000000, SellAmount: 89650000, ForwardRate: 89.65, ActiveStatus: '0',
}
const APP: TrmFxApp = {
  CompanyCode: 'SG03', FinancialTransaction: '1000000123', ZtsfDealID: 'D-1', ZtsfDealType: 'D1', ZtsfMcRefNo: 'MC1',
  ZtsfDealDesc: 'desc', TxnStatus: '03', Ztrcode: 'TR1', ZtsfBcurr: 'USD',
}
const book = (over: Partial<BookingForm> = {}): BookingForm => ({ type: '619', tdate: '2026-09-01', vdate: '2026-12-15', bp: 'BP2', rate: '90', buyAmt: '1000', sellAmt: '', ...over })

const pair = (kind: 'early' | 'rollover', over: Partial<PairInput> = {}): PairInput => ({
  kind, original: ORIGINAL, dealId: 'D-1', remark: 'note',
  newTxn: book({ type: '619' }),
  cancel: book({ type: '619', vdate: kind === 'early' ? '2026-12-20' : '2026-12-01' }),
  ...over,
})
const unwindInput = (over: Partial<UnwindInput> = {}): UnwindInput => ({
  kind: 'unwind', original: ORIGINAL, dealId: 'D-1', remark: 'note',
  form: { remark: 'note', tdate: '2026-09-01', vdate: '2026-12-01', bp: 'BP2', rate: '90', buyAmt: '', sellAmt: '1000' },
  ...over,
})

type Call = { op: string; ref?: TxnRef; fields?: AppStrFields; status?: string; body?: Record<string, unknown>; slot?: number }

/** An in-memory backend that records every write, so the sequence and its idempotency can be checked. */
function fake(opts: { fx?: Partial<FxTransaction & Record<string, unknown>>; app?: Partial<TrmFxApp>; param?: string; failAt?: string; failTimes?: number; slotRows?: FxRow[] } = {}) {
  const calls: Call[] = []
  let next = 2000
  const failures: Record<string, number> = opts.failAt ? { [opts.failAt]: opts.failTimes ?? 1 } : {}
  const maybeFail = (op: string) => {
    if ((failures[op] ?? 0) > 0) {
      failures[op] = (failures[op] ?? 0) - 1
      throw new Error(`${op} refused`)
    }
  }
  let dealRows: FxRow[] = opts.slotRows ?? [{ ZDEAL_ID: 'D-1', ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZBUKRS1: 'SG03', ZRFHA1: '1000000123', ZBUKRS2: 'SG03', ZRFHA2: '1000000999' }]
  const deps: PrematureDeps = {
    async readOriginal() {
      calls.push({ op: 'readOriginal' })
      return { fx: { ...FX, ...opts.fx } as OriginalTxn['fx'], app: { ...APP, ...opts.app } }
    },
    async productTypeOf(type) {
      calls.push({ op: `product:${type}` })
      return type === '631' ? '12D' : '12B'
    },
    async cancellationStatusConfig() {
      calls.push({ op: 'config' })
      return cancellationStatusFromParam(opts.param === undefined ? [{ PROGNAM: 'ZSGTSF_RMC_CHILD_DET', PARAM1: '3' }] : opts.param ? [{ PROGNAM: 'ZSGTSF_RMC_CHILD_DET', PARAM1: opts.param }] : [])
    },
    async createFx(body) {
      maybeFail('createFx')
      const ref = { companyCode: String(body['CompanyCode']), transaction: String(next++) }
      calls.push({ op: 'createFx', ref, body })
      return ref
    },
    async saveNewAppStr(ref, fields, status) {
      maybeFail(`saveNewAppStr:${ref.transaction}`)
      calls.push({ op: 'saveNewAppStr', ref, fields, status })
    },
    async updateOriginalAppStr(ref, fields) {
      maybeFail('updateOriginalAppStr')
      calls.push({ op: 'updateOriginalAppStr', ref, fields })
    },
    async readDealRows() {
      return dealRows
    },
    async writeDealSlot(rows, slot, ref) {
      maybeFail('writeDealSlot')
      dealRows = rows.map((r) => ({ ...r, [`ZBUKRS${slot}`]: ref.companyCode, [`ZRFHA${slot}`]: ref.transaction }))
      calls.push({ op: 'writeDealSlot', ref, slot })
    },
    today: () => '2026-10-07',
  }
  return { deps, calls, rows: () => dealRows }
}
const ops = (calls: Call[]) => calls.map((c) => c.op).filter((o) => !o.startsWith('product') && o !== 'config' && o !== 'readOriginal')
const find = (calls: Call[], op: string) => calls.filter((c) => c.op === op)

/* ---------------- calc ---------------- */

describe('amount / rate arithmetic (process_data)', () => {
  it('multiplies by the rate when the target is the follow currency, divides otherwise', () => {
    strictEqual(convertAmount(90, 1000, 'INR', 'INR'), 90000)
    strictEqual(convertAmount(90, 90000, 'USD', 'INR'), 1000)
  })
  it('applies the 1000 factor to IDR, KWA and VND only, on the target currency', () => {
    strictEqual(rateFactor('IDR'), 1000)
    strictEqual(rateFactor('KWA'), 1000)
    strictEqual(rateFactor('VND'), 1000)
    strictEqual(rateFactor('INR'), 1)
    strictEqual(convertAmount(16, 1000, 'IDR', 'IDR'), 16_000_000)
    strictEqual(convertAmount(16, 16_000_000, 'USD', 'IDR'), 1_000_000) // the factor follows the TARGET currency (USD: none)
  })
  it('derives nothing for a rate that cannot be applied (ABAP swallows the exception)', () => {
    strictEqual(convertAmount(0, 100, 'USD', 'INR'), null)
    strictEqual(convertAmount(-1, 100, 'USD', 'INR'), null)
  })
  it('fills only the empty amount and leaves a typed one alone', () => {
    const side = { tCurr: 'USD', tCurr2: 'INR', amt: 1000, amt2: 0, rate: 90 }
    deepStrictEqual(fillMissingAmounts(side, 'INR'), { ...side, amt2: 90000 })
    deepStrictEqual(fillMissingAmounts({ ...side, amt: 0, amt2: 90000 }, 'INR'), { ...side, amt: 1000, amt2: 90000 })
    deepStrictEqual(fillMissingAmounts({ ...side, amt2: 5 }, 'INR'), { ...side, amt2: 5 })
  })
  it('recomputes the other amount on a rate change from the anchor', () => {
    const side = { tCurr: 'USD', tCurr2: 'INR', amt: 1000, amt2: 90000, rate: 91 }
    strictEqual(recomputeOnRateChange(side, 'INR', 'amt').amt2, 91000)
    strictEqual(recomputeOnRateChange({ ...side, rate: 100 }, 'INR', 'amt2').amt, 900)
  })
  it('parses formatted amounts', () => {
    strictEqual(amountOf('1,234.50'), 1234.5)
    strictEqual(amountOf(''), 0)
    strictEqual(amountOf('abc'), 0)
  })
})

describe('INR invoice amount (fetch_data1 / FORM amount)', () => {
  const row = (d1Link: string, ref: string, amount: number): InvoiceAmountRow => ({ d1Link, d2Link: '', ref, amount })
  const ref = (t: string) => `${'X'.repeat(11)}${t}`
  it('uses the one row there is', () => strictEqual(inrInvoiceAmount([row('01', ref('T1'), 500)], 'D1'), 500))
  it('has nothing without rows or for a D2 deal with several rows', () => {
    strictEqual(inrInvoiceAmount([], 'D1'), 0)
    strictEqual(inrInvoiceAmount([row('01', ref('T1'), 1), row('02', ref('T2'), 2)], 'D2'), 0)
  })
  it('D1 with several rows: the later of T1 / T2 / T3 wins, by link', () => {
    strictEqual(inrInvoiceAmount([row('01', ref('T1'), 100), row('02', ref('T2'), 200)], 'D1'), 200)
    strictEqual(inrInvoiceAmount([row('01', ref('T1'), 100), row('03', ref('T3'), 300), row('02', ref('T2'), 200)], 'D1'), 300)
  })
  it('sums the invoice type when more than one T1 reference exists (lv_record2 > 1)', () => {
    strictEqual(inrInvoiceAmount([row('01', ref('T1'), 100), row('01', ref('T1'), 50), row('02', ref('T2'), 200), row('02', ref('T2'), 20)], 'D1'), 220)
  })
  it('joins BIL_ADJ in INR with the model’s RULE_BT links', () => {
    const rows = invoiceAmountRows(
      [{ ZCURR: 'INR', ZINV_REF: ref('T1'), ZAMT: '12.5' }, { ZCURR: 'USD', ZINV_REF: ref('T2'), ZAMT: '9' }],
      [{ ZD1_INV_LINK: '01', ZD2_INV_LINK: '02' }],
    )
    deepStrictEqual(rows, [{ d1Link: '01', d2Link: '02', ref: ref('T1'), amount: 12.5 }])
  })
})

/* ---------------- screen helpers ---------------- */

const LEG = {
  rfha: '1000000123', bukrs: 'SG03', sfhaart: '619', cpair: 'USD/INR', bs1: 'Buy', curr1: 'USD', amt1: 1000000, bs2: 'Sell', curr2: 'INR',
  amt2: -89650000, otot_rate: 89.65, kontrh: 'BP1', dealType: 'D1', ztsf_pre_mature: false, ztsf_unwind: false,
} as unknown as Leg

describe('eligibility and dates', () => {
  it('Early Delivery and Rollover are only for type 619', () => {
    strictEqual(gateEarly(LEG), null)
    strictEqual(gateRollover(LEG), null)
    strictEqual(gateEarly({ ...LEG, sfhaart: '631' }), MSG.notForward)
    strictEqual(gateRollover({ ...LEG, sfhaart: '605' }), MSG.notForward)
  })
  const f = (o: Partial<PairForm> & { n?: Partial<BookingForm>; c?: Partial<BookingForm> } = {}): PairForm => ({
    remark: '', newTxn: book(o.n), cancel: book(o.c),
  })
  it('Early: cancellation value date may not be earlier than the new one', () => {
    strictEqual(validateEarly(f({ n: { vdate: '2026-12-10' }, c: { vdate: '2026-12-10' } })), null)
    strictEqual(validateEarly(f({ n: { vdate: '2026-12-10' }, c: { vdate: '2026-12-09' } })), MSG.earlyCancelBeforeNew)
  })
  it('Rollover: cancellation value date may not be later than the new one', () => {
    strictEqual(validateRollover(f({ n: { vdate: '2026-12-10' }, c: { vdate: '2026-12-10' } })), null)
    strictEqual(validateRollover(f({ n: { vdate: '2026-12-10' }, c: { vdate: '2026-12-11' } })), MSG.rollCancelAfterNew)
  })
  it('trade date after value date blocks both sides; missing values block', () => {
    strictEqual(validateEarly(f({ n: { tdate: '2026-12-31' } })), MSG.newTradeAfterValue)
    strictEqual(validateRollover(f({ c: { tdate: '2026-12-31' } })), MSG.cancelTradeAfterValue)
    strictEqual(validateEarly(f({ n: { type: '' } })), MSG.mandatory)
    strictEqual(validateEarly(f({ c: { rate: '' } })), MSG.mandatory)
  })
})

describe('form recalculation', () => {
  it('maps the four currency boxes from the leg’s directions', () => {
    deepStrictEqual(legCurrencies(LEG), { newBuy: 'USD', newSell: 'INR', cancelBuy: 'INR', cancelSell: 'USD' })
    deepStrictEqual(legCurrencies({ ...LEG, bs1: 'Sell', curr1: 'INR', bs2: 'Buy', curr2: 'USD' } as Leg), { newBuy: 'USD', newSell: 'INR', cancelBuy: 'INR', cancelSell: 'USD' })
  })
  it('a rate change recomputes the amount the user did not type', () => {
    const prev = book({ rate: '90', buyAmt: '1,000.00', sellAmt: '90,000.00', anchor: 'buy' })
    const next = applyBookingEdit(prev, { ...prev, rate: '91' }, 'USD', 'INR', 'USD/INR')
    strictEqual(next.sellAmt, '91,000.00')
    strictEqual(next.buyAmt, '1,000.00')
  })
  it('typing an amount makes it the anchor and is never overwritten', () => {
    const prev = book({ rate: '90', buyAmt: '', sellAmt: '' })
    const typed = applyBookingEdit(prev, { ...prev, sellAmt: '90000' }, 'USD', 'INR', 'USD/INR')
    strictEqual(typed.anchor, 'sell')
    const rated = applyBookingEdit(typed, { ...typed, rate: '100' }, 'USD', 'INR', 'USD/INR')
    strictEqual(rated.sellAmt, '90000')
    strictEqual(rated.buyAmt, '900.00')
  })
  it('puts the invoice INR amount on the INR side only, and not over a typed amount', () => {
    const empty: PairForm = { remark: '', newTxn: book({ buyAmt: '', sellAmt: '' }), cancel: book() }
    strictEqual(withInvoiceAmount(empty, LEG, 5000).newTxn.sellAmt, '5,000.00')
    strictEqual(withInvoiceAmount(empty, LEG, 5000).newTxn.buyAmt, '')
    strictEqual(withInvoiceAmount({ ...empty, newTxn: book({ buyAmt: '', sellAmt: '7' }) }, LEG, 5000).newTxn.sellAmt, '7')
    strictEqual(withInvoiceAmount(empty, LEG, 0), empty)
  })
})

/* ---------------- rules ---------------- */

describe('status rules', () => {
  it('original status: Early 49, Rollover 61, Unwind 61 (shared legacy path), 631 -> 07 everywhere', () => {
    strictEqual(originalFinalStatus('early', '619'), '49')
    strictEqual(originalFinalStatus('rollover', '619'), '61')
    strictEqual(originalFinalStatus('unwind', '619'), '61')
    for (const kind of ['early', 'rollover', 'unwind'] as const) strictEqual(originalFinalStatus(kind, '631'), '07')
  })
  it('cancellation status: configured for Early / Unwind, 03 for Rollover, 07 for 631', () => {
    strictEqual(cancellationInitialStatus('early', '619', '03'), '03')
    strictEqual(cancellationInitialStatus('unwind', '619', '04'), '04')
    strictEqual(cancellationInitialStatus('rollover', '619', '04'), '03')
    for (const kind of ['early', 'rollover', 'unwind'] as const) strictEqual(cancellationInitialStatus(kind, '631', '03'), '07')
  })
  it('reads the configured status as "0" + the first character of PARAM1', () => {
    deepStrictEqual(cancellationStatusFromParam([{ PROGNAM: 'ZSGTSF_RMC_CHILD_DET', PARAM1: '3' }]), { status: '03', fromConfig: true })
    deepStrictEqual(cancellationStatusFromParam([{ PROGNAM: 'ZSGTSF_RMC_CHILD_DET', PARAM1: '4X' }]), { status: '04', fromConfig: true })
    deepStrictEqual(cancellationStatusFromParam([]), { status: '03', fromConfig: false })
    deepStrictEqual(cancellationStatusFromParam([{ PROGNAM: 'ZSGTSF_RMC_CHILD_DET', PARAM1: '' }]), { status: '03', fromConfig: false })
  })
})

describe('APP_STR field mapping', () => {
  it('original: Early = Deal Type 00 + 49 only; Rollover and Unwind also set the premature flag', () => {
    deepStrictEqual(originalUpdateFields('early', '619', '', '619'), { ZtsfDealType: '00', TxnStatus: '49' })
    deepStrictEqual(originalUpdateFields('rollover', '619', '', '619'), { ZtsfDealType: '00', ZtsfPreMature: true, TxnStatus: '61' })
    deepStrictEqual(originalUpdateFields('unwind', '619', '', '619'), { ZtsfDealType: '00', ZtsfPreMature: true, TxnStatus: '61' })
  })
  it('cancellation carries Deal Type 00; the premature flag for Early / Unwind but not Rollover', () => {
    strictEqual(cancellationAppFields('early', APP, '619', '', '2026-10-07').ZtsfDealType, '00')
    strictEqual(cancellationAppFields('early', APP, '619', '', 'x').ZtsfPreMature, true)
    strictEqual(cancellationAppFields('unwind', APP, '619', '', 'x').ZtsfPreMature, true)
    strictEqual(cancellationAppFields('rollover', APP, '619', '', 'x').ZtsfPreMature, undefined)
  })
  it('replacement inherits D1 / D2 and the linkage; the premature flag for Early only', () => {
    const e = replacementAppFields('early', APP, '619', '', '2026-10-07')
    deepStrictEqual([e.ZtsfDealType, e.ZtsfDealID, e.ZtsfMcRefNo, e.ZtsfDealDesc, e.Ztrcode, e.ZtsfPreMature, e.BlotterDate], ['D1', 'D-1', 'MC1', 'desc', 'TR1', true, '2026-10-07'])
    strictEqual(replacementAppFields('rollover', APP, '619', '', 'x').ZtsfPreMature, undefined)
  })
  it('the FO remark goes to NdfFoRem for NDF only; a Forward has no field and says so', () => {
    deepStrictEqual(foRemarkFields('631', ' hi '), { fields: { NdfFoRem: 'hi' }, saved: true })
    deepStrictEqual(foRemarkFields('619', 'hi'), { fields: {}, saved: false })
    deepStrictEqual(foRemarkFields('619', ' '), { fields: {}, saved: true })
  })
})

describe('Deal ID slot', () => {
  it('D1 -> slot 1, D2 -> slot 2, 00 -> none, anything else is refused', () => {
    strictEqual(dealSlotOf('D1'), 1)
    strictEqual(dealSlotOf('D2'), 2)
    strictEqual(dealSlotOf('00'), null)
    for (const bad of ['', 'D3', 'DS1']) {
      let thrown = false
      try { dealSlotOf(bad) } catch { thrown = true }
      ok(thrown, bad)
    }
  })
  it('knows when a slot already holds the new transaction', () => {
    ok(slotHolds({ ZBUKRS1: 'SG03', ZRFHA1: '5' }, 1, 'SG03', '5'))
    ok(!slotHolds({ ZBUKRS1: 'SG03', ZRFHA1: '5' }, 2, 'SG03', '5'))
    ok(!slotHolds({ ZBUKRS1: 'SG04', ZRFHA1: '5' }, 1, 'SG03', '5'))
  })
})

describe('create body', () => {
  const o: OriginalTxn = { fx: FX, app: APP }
  const spec = { txnType: '619', tradeDate: '2026-09-01', valueDate: '2026-12-15', bp: 'BP2', rate: 90, amt: 1000, amt2: 90000 }
  it('cancellation swaps the directions and carries the rate and the traded (non-USD) amount only', () => {
    const b = buildFxBody('cancellation', o, { ...spec, amt: 90000, amt2: 1000 }, '12B')
    deepStrictEqual([b['BuyCurrency'], b['SellCurrency'], b['ForwardRate'], b['TradedCurrency'], b['BuyAmount'], b['SellAmount'], b['Partner']], ['INR', 'USD', 90, 'INR', 90000, undefined, 'BP2'])
  })
  it('replacement keeps the original directions', () => {
    const b = buildFxBody('replacement', o, spec, '12B')
    deepStrictEqual([b['BuyCurrency'], b['SellCurrency'], b['TradedCurrency'], b['BuyAmount'], b['SellAmount'], b['ForwardRate']], ['USD', 'INR', 'INR', undefined, 90000, 90])
  })
  it('unwind carries both amounts and no rate, traded in the lead currency', () => {
    const b = buildFxBody('unwind', o, { ...spec, txnType: '619', amt: 90000, amt2: 1000 }, '12B')
    deepStrictEqual([b['BuyCurrency'], b['BuyAmount'], b['SellAmount'], b['TradedCurrency'], 'ForwardRate' in b], ['INR', 90000, 1000, 'USD', false])
  })
  it('uses the original’s valuation class, else 0011; the company code is the original’s', () => {
    strictEqual(buildFxBody('replacement', { fx: { ...FX, ValuationClass: '0099' }, app: APP }, spec, '12B')['ValuationClass'], '0099')
    strictEqual(buildFxBody('replacement', o, spec, '12B')['ValuationClass'], '0011')
    strictEqual(buildFxBody('replacement', o, spec, '12B')['CompanyCode'], 'SG03')
  })
  it('picks the product type: the only one, else the original’s, else refuses', () => {
    strictEqual(pickProductType([{ ProductType: '12D' }], '12B', '631'), '12D')
    strictEqual(pickProductType([{ ProductType: '12A' }, { ProductType: '12B' }], '12B', '619'), '12B')
    let thrown = 0
    for (const rows of [[], [{ ProductType: '12A' }, { ProductType: '12D' }]]) {
      try { pickProductType(rows, '12B', '619') } catch { thrown++ }
    }
    strictEqual(thrown, 2)
  })
})

/* ---------------- workflow ---------------- */

describe('Early Delivery', () => {
  it('runs cancellation -> APP_STR -> replacement -> APP_STR -> Deal slot -> original, and ends the original on 49', async () => {
    const f = fake()
    const r = await runPremature(pair('early'), f.deps)
    ok(r.ok, r.error)
    deepStrictEqual(ops(f.calls), ['createFx', 'saveNewAppStr', 'createFx', 'saveNewAppStr', 'writeDealSlot', 'updateOriginalAppStr'])
    const [cancelApp, newApp] = find(f.calls, 'saveNewAppStr')
    const [cancelFx, newFx] = find(f.calls, 'createFx')
    deepStrictEqual([cancelApp?.ref, newApp?.ref], [cancelFx?.ref, newFx?.ref])
    // cancellation: Deal Type 00, configured status (03), premature flag
    deepStrictEqual([cancelApp?.fields?.ZtsfDealType, cancelApp?.status, cancelApp?.fields?.ZtsfPreMature], ['00', '03', true])
    // replacement: the original's D1, status 03, premature flag, blotter date, linkage
    deepStrictEqual([newApp?.fields?.ZtsfDealType, newApp?.status, newApp?.fields?.ZtsfPreMature, newApp?.fields?.BlotterDate, newApp?.fields?.ZtsfDealID], ['D1', '03', true, '2026-10-07', 'D-1'])
    // Deal ID: the replacement (not the cancellation) takes slot 1
    const slot = find(f.calls, 'writeDealSlot')[0]
    deepStrictEqual([slot?.slot, slot?.ref], [1, newFx?.ref])
    // original
    const orig = find(f.calls, 'updateOriginalAppStr')[0]
    deepStrictEqual([orig?.ref, orig?.fields], [ORIGINAL, { ZtsfDealType: '00', TxnStatus: '49' }])
    strictEqual(f.rows()[0]?.['ZRFHA1'], newFx?.ref?.transaction)
    strictEqual(f.rows()[0]?.['ZRFHA2'], '1000000999')
  })
  it('a D2 original replaces slot 2', async () => {
    const f = fake({ app: { ZtsfDealType: 'D2' } })
    ok((await runPremature(pair('early'), f.deps)).ok)
    strictEqual(find(f.calls, 'writeDealSlot')[0]?.slot, 2)
  })
  it('the cancellation starts on the status ZGTCATR_PARAM configures, not a hard-coded 03', async () => {
    const f = fake({ param: '4' })
    ok((await runPremature(pair('early'), f.deps)).ok)
    strictEqual(find(f.calls, 'saveNewAppStr')[0]?.status, '04')
    strictEqual(find(f.calls, 'saveNewAppStr')[1]?.status, '03')
  })
  it('falls back to 03 when the config row is missing, and says so', async () => {
    const f = fake({ param: '' })
    const r = await runPremature(pair('early'), f.deps)
    strictEqual(find(f.calls, 'saveNewAppStr')[0]?.status, '03')
    ok(r.notes.some((n) => n.includes('ZGTCATR_PARAM')))
  })
  it('type 631 for the new booking sends the original to 07 (the type ABAP tests) and the 631 cancellation to 07', async () => {
    const f = fake()
    const r = await runPremature(pair('early', { newTxn: book({ type: '631' }), cancel: book({ type: '631', vdate: '2026-12-20' }) }), f.deps)
    ok(r.ok, r.error)
    strictEqual(find(f.calls, 'saveNewAppStr')[0]?.status, '07')
    strictEqual(find(f.calls, 'updateOriginalAppStr')[0]?.fields?.TxnStatus, '07')
    strictEqual(find(f.calls, 'createFx')[0]?.body?.['ProductType'], '12D')
  })
  it('refuses a non-619 original, an already pre-matured one, before anything is created', async () => {
    for (const [over, msg] of [[{ fx: { TransactionType: '631' } }, MSG.notForward], [{ app: { ZtsfPreMature: true } }, MSG.alreadyPm]] as const) {
      const f = fake(over)
      const r = await runPremature(pair('early'), f.deps)
      strictEqual(r.ok, false)
      strictEqual(r.error, msg)
      strictEqual(find(f.calls, 'createFx').length, 0)
    }
  })
  it('refuses an original with no D1 / D2 slot before creating anything', async () => {
    const f = fake({ app: { ZtsfDealType: '00' } })
    const r = await runPremature(pair('early'), f.deps)
    strictEqual(r.ok, false)
    strictEqual(r.failedStage, 'preflight')
    strictEqual(find(f.calls, 'createFx').length, 0)
  })
  it('asks for an amount rather than creating a transaction with none', async () => {
    const f = fake()
    const r = await runPremature(pair('early', { newTxn: book({ buyAmt: '', sellAmt: '' }) }), f.deps)
    strictEqual(r.error, MSG.amountRequired)
    strictEqual(find(f.calls, 'createFx').length, 0)
  })
  it('derives the empty amount from the rate before posting', async () => {
    const f = fake()
    await runPremature(pair('early'), f.deps)
    // new booking: USD buy, INR sell; the user typed 1000 USD, so INR (the traded currency) is 1000 * 90
    strictEqual(find(f.calls, 'createFx')[1]?.body?.['SellAmount'], 90000)
  })
  it('keeps the FO remark off a Forward and says so', async () => {
    const f = fake()
    const r = await runPremature(pair('early'), f.deps)
    ok(r.notes.some((n) => n.includes('FO remark')))
    strictEqual(find(f.calls, 'saveNewAppStr')[0]?.fields?.NdfFoRem, undefined)
  })
})

describe('Rollover', () => {
  it('cancellation 03 without the premature flag, replacement D1 03, original 61 with the flag', async () => {
    const f = fake({ param: '4' })
    const r = await runPremature(pair('rollover'), f.deps)
    ok(r.ok, r.error)
    const [c, n] = find(f.calls, 'saveNewAppStr')
    deepStrictEqual([c?.status, c?.fields?.ZtsfDealType, c?.fields?.ZtsfPreMature], ['03', '00', undefined])
    deepStrictEqual([n?.status, n?.fields?.ZtsfDealType, n?.fields?.ZtsfPreMature], ['03', 'D1', undefined])
    deepStrictEqual(find(f.calls, 'updateOriginalAppStr')[0]?.fields, { ZtsfDealType: '00', ZtsfPreMature: true, TxnStatus: '61' })
    deepStrictEqual(ops(f.calls), ['createFx', 'saveNewAppStr', 'createFx', 'saveNewAppStr', 'writeDealSlot', 'updateOriginalAppStr'])
  })
  it('type 631 -> original 07', async () => {
    const f = fake()
    await runPremature(pair('rollover', { newTxn: book({ type: '631' }), cancel: book({ type: '631', vdate: '2026-11-01' }) }), f.deps)
    strictEqual(find(f.calls, 'updateOriginalAppStr')[0]?.fields?.TxnStatus, '07')
  })
  it('the original is not marked 61 before both replacements exist', async () => {
    const f = fake()
    // fail on the second create
    let n = 0
    const create = f.deps.createFx
    f.deps.createFx = async (b) => { if (++n === 2) throw new Error('boom'); return create(b) }
    const r = await runPremature(pair('rollover'), f.deps)
    strictEqual(r.failedStage, 'createReplacement')
    strictEqual(find(f.calls, 'updateOriginalAppStr').length, 0)
  })
  it('notification is a reported gap and follows the multiple-of-four rule', () => {
    ok(sendRolloverNotification().reason.startsWith('WAITING FOR API'))
    deepStrictEqual([3, 4, 8, 0].map(shouldNotifyRollover), [false, true, true, false])
  })
})

describe('Unwinding', () => {
  it('creates the unwind txn (00, premature, configured status), flags the original, then updates it to 61', async () => {
    const f = fake()
    const r = await runPremature(unwindInput(), f.deps)
    ok(r.ok, r.error)
    deepStrictEqual(ops(f.calls), ['createFx', 'saveNewAppStr', 'updateOriginalAppStr', 'updateOriginalAppStr'])
    const app = find(f.calls, 'saveNewAppStr')[0]
    deepStrictEqual([app?.fields?.ZtsfDealType, app?.fields?.ZtsfPreMature, app?.status], ['00', true, '03'])
    const [flag, update] = find(f.calls, 'updateOriginalAppStr')
    deepStrictEqual(flag?.fields, { ZtsfUnwind: true })
    deepStrictEqual(update?.fields, { ZtsfDealType: '00', ZtsfPreMature: true, TxnStatus: '61' })
    strictEqual(find(f.calls, 'writeDealSlot').length, 0)
  })
  it('NDF 631 -> the unwind transaction and the original go to 07, and the NDF remark is kept', async () => {
    const f = fake({ fx: { TransactionType: '631', ProductType: '12D' } })
    const r = await runPremature(unwindInput(), f.deps)
    ok(r.ok, r.error)
    strictEqual(find(f.calls, 'saveNewAppStr')[0]?.status, '07')
    strictEqual(find(f.calls, 'saveNewAppStr')[0]?.fields?.NdfFoRem, 'note')
    strictEqual(find(f.calls, 'updateOriginalAppStr')[1]?.fields?.TxnStatus, '07')
    strictEqual(r.notes.length, 0)
  })
  it('does not unwind an unwound transaction', async () => {
    const f = fake({ app: { ZtsfUnwind: true } })
    const r = await runPremature(unwindInput(), f.deps)
    strictEqual(r.error, MSG.alreadyUnwound)
    strictEqual(find(f.calls, 'createFx').length, 0)
  })
  it('has no 619 restriction', async () => {
    const f = fake({ fx: { TransactionType: '605', ProductType: '12A' } })
    ok((await runPremature(unwindInput(), f.deps)).ok)
  })
})

describe('partial failure and retry', () => {
  it('a failed replacement create keeps the cancellation and does not create it again on retry', async () => {
    const f = fake()
    let n = 0
    const create = f.deps.createFx
    f.deps.createFx = async (b) => { if (++n === 2) throw new Error('SAP down'); return create(b) }
    const first = await runPremature(pair('early'), f.deps)
    strictEqual(first.ok, false)
    strictEqual(first.failedStage, 'createReplacement')
    ok(first.progress.cancellationAppSaved)
    ok(first.progress.cancellationTransaction)
    ok(canResume(first, ORIGINAL))
    ok(describeFailure(first).includes('will not be created again'))
    strictEqual(find(f.calls, 'updateOriginalAppStr').length, 0)

    const second = await runPremature(pair('early'), f.deps, first.progress)
    ok(second.ok, second.error)
    strictEqual(find(f.calls, 'createFx').length, 2) // one cancellation, one replacement — not three
    strictEqual(find(f.calls, 'saveNewAppStr').length, 2)
    strictEqual(find(f.calls, 'updateOriginalAppStr').length, 1)
  })
  it('a failed APP_STR save is retried without a second Treasury transaction', async () => {
    const f = fake({ failAt: 'saveNewAppStr:2000' })
    const first = await runPremature(pair('rollover'), f.deps)
    strictEqual(first.failedStage, 'cancellationAppStr')
    strictEqual(first.progress.cancellationTransaction?.transaction, '2000')
    const second = await runPremature(pair('rollover'), f.deps, first.progress)
    ok(second.ok, second.error)
    strictEqual(find(f.calls, 'createFx').length, 2)
  })
  it('both transactions created, Deal ID slot fails: retry updates the slot only, and the original is still untouched', async () => {
    const f = fake({ failAt: 'writeDealSlot' })
    const first = await runPremature(pair('early'), f.deps)
    strictEqual(first.failedStage, 'dealSlot')
    strictEqual(find(f.calls, 'updateOriginalAppStr').length, 0)
    const before = find(f.calls, 'createFx').length
    const second = await runPremature(pair('early'), f.deps, first.progress)
    ok(second.ok, second.error)
    strictEqual(find(f.calls, 'createFx').length, before)
    strictEqual(find(f.calls, 'writeDealSlot').length, 1)
  })
  it('a slot that already points at the new transaction counts as done', async () => {
    const f = fake()
    const first = await runPremature(pair('early'), f.deps)
    ok(first.ok)
    const progress = { ...first.progress, dealSlotUpdated: false, originalUpdated: false }
    const writes = find(f.calls, 'writeDealSlot').length
    const second = await runPremature(pair('early'), f.deps, progress)
    ok(second.ok, second.error)
    strictEqual(find(f.calls, 'writeDealSlot').length, writes)
  })
  it('slot done, original update fails: retry only updates the original, even though it now reads as Deal Type 00', async () => {
    const f = fake({ failAt: 'updateOriginalAppStr' })
    const first = await runPremature(pair('rollover'), f.deps)
    strictEqual(first.failedStage, 'originalUpdate')
    ok(first.progress.dealSlotUpdated)
    const retry = fake({ app: { ZtsfDealType: '00' } })
    const second = await runPremature(pair('rollover'), retry.deps, first.progress)
    ok(second.ok, second.error)
    strictEqual(find(retry.calls, 'createFx').length, 0)
    strictEqual(find(retry.calls, 'writeDealSlot').length, 0)
    strictEqual(find(retry.calls, 'updateOriginalAppStr').length, 1)
  })
  it('unwind: a failure after the flag resumes at the original update', async () => {
    const f = fake({ failAt: 'updateOriginalAppStr', failTimes: 2 })
    const first = await runPremature(unwindInput(), f.deps)
    strictEqual(first.failedStage, 'originalUnwindFlag')
    const second = await runPremature(unwindInput(), f.deps, first.progress)
    strictEqual(second.failedStage, 'originalUnwindFlag')
    const third = await runPremature(unwindInput(), f.deps, second.progress)
    ok(third.ok, third.error)
    strictEqual(find(f.calls, 'createFx').length, 1)
  })
  it('a retry is not blocked by the flag its own earlier attempt set', async () => {
    const f = fake({ failAt: 'updateOriginalAppStr', failTimes: 1 })
    // first attempt: unwind flag write fails... then a resumed run sees ZtsfUnwind already true on the read
    const first = await runPremature(unwindInput(), f.deps)
    const resumed = fake({ app: { ZtsfUnwind: true } })
    const second = await runPremature(unwindInput(), resumed.deps, { ...first.progress, unwindFlagSet: true })
    ok(second.ok, second.error)
    strictEqual(find(resumed.calls, 'createFx').length, 0)
  })
  it('freshProgress records nothing', () => {
    deepStrictEqual(freshProgress(), { cancellationAppSaved: false, replacementAppSaved: false, dealSlotUpdated: false, unwindFlagSet: false, originalUpdated: false })
  })
})

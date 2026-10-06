import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fxRow } from './fixtures.ts'
import { buildInvoiceRows, invoiceDifference, invoiceGroups, leadCurrency, modelWithCurrency, profitWindow, rollDealTypes, statusList, type PlanInput } from './invoice.ts'

const near = (a: number, b: number) => ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`)

describe('FORM screen_desc_fields / drop_down', () => {
  it('appends 01 (C001) / 02 (C003) to M030, M034 and M020 only', () => {
    deepStrictEqual(
      [modelWithCurrency('M034', 'C001'), modelWithCurrency('M030', 'C003'), modelWithCurrency('M020', 'C002'), modelWithCurrency('M033', 'C001')],
      ['M03401', 'M03002', 'M020', 'M033'],
    )
  })

  it('Deal ID Status: DEAL_ST without blank codes, FX2 dropped for a forward model, FX1 for M034/M035/M036', () => {
    // As served on 2026-10-05 (excerpt).
    const rows = [
      { ZSUB_TYPE: 'FX1', ZDEAL_STAT: '05', ZDEAL_SDESC: 'Invoice Created in TRM' },
      { ZSUB_TYPE: 'FX1', ZDEAL_STAT: '04', ZDEAL_SDESC: 'BL Assigned to Deal ID for Invoicing' },
      { ZSUB_TYPE: 'FX2', ZDEAL_STAT: '14', ZDEAL_SDESC: 'Options Exercised / Expired' },
      { ZSUB_TYPE: 'FX2', ZDEAL_STAT: '05', ZDEAL_SDESC: 'Invoice Created in TRM (opt)' },
      { ZSUB_TYPE: 'FX1', ZDEAL_STAT: '', ZDEAL_SDESC: 'blank' },
    ]
    deepStrictEqual(statusList(rows, 'M033'), [
      { key: '04', text: '04 - BL Assigned to Deal ID for Invoicing' },
      { key: '05', text: '05 - Invoice Created in TRM' },
    ])
    deepStrictEqual(
      statusList(rows, 'M03401').map((o) => o.key),
      ['05', '14'],
    )
  })
})

describe('FORM deal_detals roll numbering', () => {
  it('numbers TXN_STATUS 61 rows R<n>-D1 / R<n>-D2 and deal type 00 rows C<n>-D1 / C<n>-D2, by transaction number', () => {
    const top = [
      fxRow({ dealType: 'D1', rfha: '100', bs1: 'Buy', curr1: 'USD', bs2: 'Sell', curr2: 'INR', txn: '03' }),
      fxRow({ dealType: 'D2', rfha: '200', bs1: 'Sell', curr1: 'USD', bs2: 'Buy', curr2: 'INR', txn: '03' }),
      fxRow({ dealType: '00', rfha: '302', bs1: 'Buy', curr1: 'USD', bs2: 'Sell', curr2: 'INR', txn: '61' }),
      fxRow({ dealType: '00', rfha: '301', bs1: 'Sell', curr1: 'INR', bs2: 'Buy', curr2: 'USD', txn: '61' }),
      fxRow({ dealType: '00', rfha: '401', bs1: 'Sell', curr1: 'USD', bs2: 'Buy', curr2: 'INR', txn: '05' }),
      fxRow({ dealType: '00', rfha: '402', bs1: 'Buy', curr1: 'INR', bs2: 'Sell', curr2: 'USD', txn: '05' }),
    ]
    const out = Object.fromEntries(rollDealTypes(top).map((r) => [r.rfha, r.roll]))
    deepStrictEqual(out, { '100': '', '200': '', '301': 'R1-D1', '302': 'R2-D1', '401': 'C1-D1', '402': 'C2-D1' })
  })

  it('leaves everything unnumbered without a D1', () => {
    deepStrictEqual(
      rollDealTypes([fxRow({ dealType: '00', rfha: '1', txn: '61' })]).map((r) => r.roll),
      [''],
    )
  })
})

describe('FORM sub_total / invoice_plan', () => {
  it('groups BLs by invoice date + commodity + TRM commodity, ZCPRICE = ZTTV / quantity', () => {
    const g = invoiceGroups([
      { ZINV_DATE: '2026-10-02', ZINV_COMM: 'RICE', ZTRM_COM_ID: 'C125', ZQUANTITY: '60.000', ZTTV: '6000.00', ZINCO: 'FOB', ZINV_TYPE: '' },
      { ZINV_DATE: '2026-10-01', ZINV_COMM: 'RICE', ZTRM_COM_ID: 'C125', ZQUANTITY: '10.000', ZTTV: '900.00', ZINCO: 'CFR', ZINV_TYPE: 'I01' },
      { ZINV_DATE: '2026-10-02', ZINV_COMM: 'RICE', ZTRM_COM_ID: 'C125', ZQUANTITY: '40.000', ZTTV: '4400.00', ZINCO: 'FOB', ZINV_TYPE: '' },
    ])
    deepStrictEqual(
      g.map((x) => [x.invDate, x.quantity, x.ttv, x.cprice, x.inco, x.invType]),
      [
        ['2026-10-01', 10, 900, 90, 'CFR', 'I01'],
        ['2026-10-02', 100, 10400, 104, 'FOB', ''],
      ],
    )
  })

  it('ORG_PRO: the window containing today wins (ZSDATE is stored without dashes)', () => {
    const rows = [
      { ZSDATE: '20260701', ZEDATE: '2026-09-30', ZPRO_MARG_INV: '0.2500', ZPRO_COMP: 'LOWER' },
      { ZSDATE: '20261001', ZEDATE: '2026-12-31', ZPRO_MARG_INV: '0.3000', ZPRO_COMP: '' },
    ]
    deepStrictEqual(profitWindow(rows, '20261005'), { percent: 0.3, check: '', maintained: true })
    strictEqual(profitWindow(rows, '20270101').maintained, false)
  })

  it('ZSGTRMFM_LEAD_CURR stand-in: USD leads INR, EUR leads USD', () => {
    deepStrictEqual([leadCurrency('USD', 'INR'), leadCurrency('USD', 'EUR')], ['USD', 'EUR'])
  })

  const base: PlanInput = {
    dealId: '7000000009',
    dm: false,
    zrfha1: '3000000000015',
    zrfha2: '2000000000001',
    model: 'M033',
    region: 'R04',
    rule: { ZMOD_ID: 'M033', ZSUB_TYPE: 'FX1', ZD1_BCURR: 'USD', ZD1_INV_LINK: '01', ZD1_INV_LINK2: '', ZD2_INV_LINK: '02', ZD2_INV_LINK2: '', ZPRE_SIGN: '' },
    entStr: { ZENT1: 'OGA', ZENT2: 'OSIPL', ZENT3: 'OGA' },
    curStr: { ZCURR1: 'USD', ZCURR2: 'INR', ZCURR3: 'USD' },
    invRef: [{ ZTTYPE: 'T2', ZINV_TRM_NO: '7000000009-T2', ZAMT: '10000.00', ZINV_AMT: '835000.00', ZEX_RATE: '83.5000000', ZMC_REF_P: 'P1', ZMC_REF_S: 'S1' }],
    bilAdj: [],
    orgPro: [{ ZSDATE: '20261001', ZEDATE: '2026-12-31', ZPRO_MARG_INV: '0.3000', ZPRO_COMP: '' }],
    profitModel: false,
    bls: [{ ZINV_DATE: '2026-10-02', ZINV_COMM: 'RICE', ZTRM_COM_ID: 'C125', ZQUANTITY: '100.000', ZTTV: '10000.00', ZINCO: 'FOB', ZINV_TYPE: '' }],
    top: [
      fxRow({ dealType: 'D1', rfha: '3000000000015', partner: '0400000002', allIn: 83.5, end: '30-10-2026', curr1: 'USD', amt1: 10000, curr2: 'INR', amt2: -835000 }),
      fxRow({ dealType: 'D2', rfha: '2000000000001', partner: '0400000009', allIn: 84, end: '31-10-2026', curr1: 'USD', amt1: -10000, curr2: 'INR', amt2: 840000 }),
    ],
    premiumRate: null,
    today: '20261005',
  }

  it('builds T1 / T2 / T3 per group: USD at rate 1, INR from the linked deal, then the profit-loaded D1 rate', () => {
    const { rows, profitMaintained } = buildInvoiceRows(base)
    strictEqual(profitMaintained, true)
    deepStrictEqual(
      rows.map((r) => [r.ttype, r.invType, r.seller, r.buyer, r.curr, r.dealType, r.bp, r.qty, r.usdPrice, r.price, r.amt, r.amtUsd, r.dueDate, r.locked]),
      [
        ['T1', 'I01', 'OGA', 'OSIPL', 'USD', 'D1', '0400000002', 100, 100, 100, 10000, 10000, '30-10-2026', false],
        ['T2', 'I01', 'OSIPL', 'OGA', 'INR', 'D2', '0400000009', 100, 100, 8400, 840000, 10000, '30-10-2026', false],
        ['T3', 'I01', 'OGA', 'OGA', 'USD', '', '', 100, 100, 100, 10000, 10000, '30-10-2026', false],
      ],
    )
    strictEqual(rows[0]!.rate, 1)
    // T2: D1 is USD-based and T2 is not D1 -> otot_rate(D1) + 0.3 %.
    near(rows[1]!.rate, 83.7505)
    strictEqual(rows[1]!.planned, 835000)
    strictEqual(rows[1]!.rec['ZINV_REF'], '7000000009-T2')
    strictEqual(rows[1]!.rec['ZPRATE'], 83.5)
  })

  it('takes a saved ZSGTSFTR_BIL_ADJ row (ref + planned date + type) and locks a row whose BL has an invoice type', () => {
    const saved = { ZINV_REF: '7000000009-T2', ZINV_PDATE: '2026-10-02', ZINV_TYPE: 'I01', ZINV_DATE: '2026-10-03', ZQTY: '90.000', ZPRICE: '8350.1234', ZUSD_PRICE: '100.0000', ZRATE: '83.5000000', ZCURR: 'INR', ZINV_NO: '6000000001', ZPC: 'C', ZSELL: 'OSIPL', ZBUY: 'OGA' }
    const { rows } = buildInvoiceRows({ ...base, bilAdj: [saved], bls: [{ ...base.bls[0]!, ZINV_TYPE: 'I01' }] })
    const t2 = rows.find((r) => r.ttype === 'T2')!
    deepStrictEqual([t2.qty, t2.price, t2.amt, t2.invDate, t2.invNo, t2.pc, t2.locked, t2.rate], [90, 8350.12, 751510.8, '03-10-2026', '6000000001', 'C', true, 83.5])
  })

  it('Data migration (ZDM = X): the saved rows as they are, trade type from ZINV_REF+11(2)', () => {
    const { rows } = buildInvoiceRows({
      ...base,
      dm: true,
      bilAdj: [{ ZINV_REF: '7000000009-T1', ZINV_TYPE: 'I01', ZQTY: '5.000', ZPRICE: '10.0000', ZUSD_PRICE: '10.0000', ZCURR: 'USD', ZRATE: '1.0000000', ZSELL: 'OGA' }],
    })
    deepStrictEqual(rows.map((r) => [r.ttype, r.qty, r.amt, r.locked]), [['T1', 5, 50, true]])
  })

  it('a roll-over deal plans each trade at its FX deal amount (curr1 <> USD ? amt1 : amt2)', () => {
    const top = [{ ...base.top[0]!, roll: 'R1-D1' }, base.top[1]!]
    const { rows } = buildInvoiceRows({ ...base, top })
    deepStrictEqual(rows.map((r) => r.planned), [-835000, 840000, 0])
  })
})

describe('FORM fetch_invoice_diff', () => {
  const rule = { ZD1_INV_LINK: '01', ZD1_INV_LINK2: '', ZD2_INV_LINK: '02', ZD2_INV_LINK2: '' }
  const invRef = [
    { ZTTYPE: 'T1', ZTRD_CURR: 'USD', ZAMT: '10000.00', ZINV_AMT: '0.00' },
    { ZTTYPE: 'T2', ZTRD_CURR: 'INR', ZAMT: '10000.00', ZINV_AMT: '835000.00' },
  ]
  const bilAdj = [
    { ZINV_REF: '7000000009-T1', ZAMT_USD: '10100.00', ZAMT: '10100.00' },
    { ZINV_REF: '7000000009-T2', ZAMT_USD: '10100.00', ZAMT: '843350.00' },
  ]

  it('plans USD at ZAMT, others at ZINV_AMT; final from BIL_ADJ by ZINV_REF+11(2); deal amount by link digit', () => {
    const top = [fxRow({ dealType: 'D1', curr1: 'USD', amt1: 10000, curr2: 'INR', amt2: -835000 }), fxRow({ dealType: 'D2', curr1: 'USD', amt1: -10000, curr2: 'INR', amt2: 840000 })]
    deepStrictEqual(invoiceDifference(invRef, bilAdj, rule, top), [
      { ttype: 'T1', finalAmt: 10100, currency: 'USD', planned: 10000, diff1: 100, dealType: 'D1', dealAmt: 10000, diff2: 100 },
      { ttype: 'T2', finalAmt: 843350, currency: 'INR', planned: 835000, diff1: 8350, dealType: 'D2', dealAmt: 840000, diff2: 3350 },
    ])
  })

  it('without the FX deals there is no deal amount (null), never a made-up 0', () => {
    const rows = invoiceDifference(invRef, bilAdj, rule, null)
    deepStrictEqual(rows.map((r) => [r.dealAmt, r.diff2]), [[null, null], [null, null]])
  })
})

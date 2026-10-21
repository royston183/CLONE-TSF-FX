import { deepStrictEqual, strictEqual, ok } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildSpotBody, spotAppFields, createNdfSpot, deriveNdfSpotType, type NdfSpotRequest, type NdfSpotPorts } from './spotNdf.ts'
import type { FxRow } from '../../shared/fx/mw.ts'
import { buildNdfSpot, ndfSpotIssue, recalcSpotAmounts } from './logic.ts'
import { LOOKUPS, mkTxn } from './data.ts'
import { inSpotFromRow } from './api.ts'

const req: NdfSpotRequest = {
  variant: 'ndf',
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
    const fields = spotAppFields(req, { ZtsfDealID: '7000000035', ZtsfDealDesc: 'Nidhi S', ZtsfMcRefNo: '2000000028', ZtsfDealSq: '2', Ztrcode: 'T01' }, '2026-10-09', 'DS1')
    deepStrictEqual(fields, {
      ZtsfDealID: '7000000035',
      ZtsfDealDesc: 'Nidhi S',
      ZtsfMcRefNo: '2000000028',
      ZtsfDealSq: '2',
      ZtsfExOptNo: '2000000000039',
      Ztrcode: 'T01',
      BlotterDate: '2026-10-09',
      ZtsfDealType: 'DS1',
    })
  })
})

const COMPANIES: FxRow[] = [
  { ZBUKRS: 'IN11', ZCOM_ID: 'OSIPL' },
  { ZBUKRS: 'SG03', ZCOM_ID: 'OGA' },
]
const PAY: FxRow[] = [{ ZMOD_ID: 'M032', ZD1_BUKRS: 'OSIPL', ZD1_BCURR: 'INR', ZD2_BUKRS: '', ZD2_BCURR: '' }]
const invoice: FxRow = { ZDEAL_ID: '7000000071', ZDEAL_TYPE: 'D2', ZRFHA: '', ZF_AMT: '8000000', ZCURR: 'INR', ZBS: 'Buy', ZSBUKRS: 'OSIPL' }

function fakePorts() {
  const rows: Record<string, FxRow[]> = {
    tsfDealId: [{ ZDEAL_ID: '7000000071', ZMC_REF: '2000000045', ZTSF_MODEL: 'M032' }],
    masterContract: [{ ZMC_REF_NO: '2000000045', ZMOD_ID: 'M032' }],
    comp: COMPANIES,
    tsfPay: PAY,
    setFx: [
      { ZMOD_ID: 'M032', ZD_MAP: 'DS1', ZBUKRS: 'IN11', ZBS: 'B', ZCURR: 'INR' },
      { ZMOD_ID: 'M032', ZD_MAP: 'DS1', ZBUKRS: 'IN11', ZBS: 'S', ZCURR: 'USD' },
    ],
    inSpot: [invoice],
  }
  const fx = { CompanyCode: 'SG03', FinancialTransaction: '2000000000075', Partner: '0660012998', TransactionType: '631', ValueDate: '2026-10-12', BuyCurrency: 'INR', SellCurrency: 'USD', LeadCurrency: 'USD', FollowCurrency: 'INR' }
  const app = { ZtsfDealID: '7000000071', ZtsfMcRefNo: '2000000045', ZtsfDealType: 'D2', ZtsfDealSq: '2' }
  const writes: { kind: string; company: string; fields: Record<string, unknown> }[] = []
  const deps: NdfSpotPorts = {
    source: async () => ({ fx, app }),
    list: async (resource, filter) => (rows[resource] ?? []).filter((r) => Object.entries(filter).every(([key, value]) => r[key] === value)),
    productType: async () => '12A',
    create: async (body) => { writes.push({ kind: 'create', company: String(body['CompanyCode']), fields: body }); return { key: 'new-spot' } },
    save: async (company, transaction, fields) => { strictEqual(transaction, 'new-spot'); writes.push({ kind: 'app', company, fields }) },
  }
  return { rows, fx, app, deps, writes }
}

describe('ABAP NDF / DNDF spot routing', () => {
  it('keeps the USD/INR pair visible without inventing invoice amounts when settlement details are absent', () => {
    const txn = mkTxn('7000000072', '2000000000076', { curr1: 'USD', curr2: 'INR', amt1: -20000, amt2: 1600000 })
    const draft = buildNdfSpot(txn, null)
    deepStrictEqual([draft.curr1, draft.curr2, draft.amt1, draft.amt2], ['USD', 'INR', 0, 0])
    const afterRate = recalcSpotAmounts({ ...draft, rate: 60 })
    deepStrictEqual([afterRate.curr1, afterRate.curr2, afterRate.amt1, afterRate.amt2], ['USD', 'INR', 0, 0])
    ok(ndfSpotIssue(txn, null).includes('Save the FX–Invoice Difference'))
    const incomplete = inSpotFromRow({ ...invoice, ZCURR: '' })
    deepStrictEqual([buildNdfSpot(txn, incomplete).curr1, buildNdfSpot(txn, incomplete).curr2], ['USD', 'INR'])
    ok(ndfSpotIssue(txn, incomplete).includes('invoice currency'))
  })

  it('explains invalid invoice details and allows a complete invoice draft to calculate both legs', () => {
    const before = LOOKUPS.companies
    LOOKUPS.companies = [{ code: 'IN11', entity: 'OSIPL', name: 'OSIPL' }]
    try {
      const txn = mkTxn('deal', 'ndf', { curr1: 'USD', curr2: 'INR' })
      for (const fields of [{ ZF_AMT: '0' }, { ZF_AMT: 'Infinity' }, { ZCURR: 'EUR' }, { ZBS: '' }, { ZSBUKRS: '' }]) {
        ok(ndfSpotIssue(txn, inSpotFromRow({ ...invoice, ...fields })))
      }
      ok(ndfSpotIssue({ ...txn, curr2: '' }, inSpotFromRow(invoice)).includes('source NDF currency pair'))
      strictEqual(ndfSpotIssue(txn, inSpotFromRow(invoice)), '')
      const draft = recalcSpotAmounts({ ...buildNdfSpot(txn, inSpotFromRow(invoice)), rate: 80 })
      deepStrictEqual([draft.curr1, draft.curr2, draft.amt1, draft.amt2], ['INR', 'USD', 8000000, 100000])
    } finally {
      LOOKUPS.companies = before
    }
  })

  it('defaults M032 D2 to the invoice entity IN11 and its invoice amount, not the SG03 NDF notional', () => {
    const before = LOOKUPS.companies
    LOOKUPS.companies = [{ code: 'IN11', entity: 'OSIPL', name: 'OSIPL' }, { code: 'SG03', entity: 'OGA', name: 'OGA' }]
    try {
      const draft = buildNdfSpot(mkTxn('7000000071', '2000000000075', { bukrs: 'SG03', entity: 'OGA', curr1: 'USD', curr2: 'INR', amt1: 80000000, amt2: 6400000000 }), inSpotFromRow(invoice))
      deepStrictEqual([draft.bukrs, draft.curr1, draft.curr2, draft.amt1, draft.amt2, draft.base], ['IN11', 'INR', 'USD', 8000000, 0, 1])
      const missing = buildNdfSpot(mkTxn('deal', 'ndf', { bukrs: 'SG03', amt1: 80000000 }), null)
      deepStrictEqual([missing.bukrs, missing.amt1, missing.amt2], ['', 0, 0])
      const sell = buildNdfSpot(mkTxn('deal', 'ndf', { curr1: 'USD', curr2: 'INR' }), inSpotFromRow({ ...invoice, ZBS: 'Sell' }))
      deepStrictEqual([sell.curr1, sell.curr2, sell.amt1, sell.amt2, sell.base], ['USD', 'INR', 0, 8000000, 2])
    } finally {
      LOOKUPS.companies = before
    }
  })

  it('derives DS1 from TSF_PAY for M032, and gives the original currency 2 priority', () => {
    strictEqual(deriveNdfSpotType(PAY, COMPANIES, 'IN11', ['INR', 'USD']), 'DS1')
    strictEqual(deriveNdfSpotType(PAY, COMPANIES, 'SG03', ['INR', 'USD']), '')
    const pay = [{ ...PAY[0], ZD2_BUKRS: 'OSIPL', ZD2_BCURR: 'USD' }]
    strictEqual(deriveNdfSpotType(pay, COMPANIES, 'IN11', ['INR', 'USD']), 'DS1')
    strictEqual(deriveNdfSpotType(pay, COMPANIES, 'IN11', ['EUR', 'USD']), 'DS2')
    strictEqual(deriveNdfSpotType([{ ...pay[0], ZD2_BCURR: 'INR' }], COMPANIES, 'IN11', ['INR']), 'DS2')
  })

  it('books M032 D2 as IN11 / DS1 and keeps its original NDF reference', async () => {
    const { deps, writes } = fakePorts()
    const result = await createNdfSpot({ ...req, bukrs: 'IN11', source: { bukrs: 'SG03', rfha: '2000000000075' } }, deps)
    ok(result.ok)
    deepStrictEqual(writes.map((w) => [w.kind, w.company]), [['create', 'IN11'], ['app', 'IN11']])
    deepStrictEqual([writes[1]?.fields['ZtsfDealType'], writes[1]?.fields['ZtsfExOptNo'], writes[1]?.fields['ZtsfDealID']], ['DS1', '2000000000075', '7000000071'])
  })

  it('rejects the old SG03 / DS2 path before creating any SAP transaction', async () => {
    const { deps, writes } = fakePorts()
    const result = await createNdfSpot(req, deps)
    ok(!result.ok && result.message.includes('no NDF spot routing'))
    strictEqual(writes.length, 0)
  })

  it('uses only the original bought currency for DNDF routing', async () => {
    const { deps, fx, rows, writes } = fakePorts()
    rows['inSpot'] = [] // DNDF cash settlement does not require invoice data.
    fx.BuyCurrency = 'USD'
    let result = await createNdfSpot({ ...req, variant: 'dndf', bukrs: 'IN11' }, deps)
    ok(!result.ok && result.message.includes('no NDF spot routing'))
    strictEqual(writes.length, 0)
    fx.BuyCurrency = 'INR'
    result = await createNdfSpot({ ...req, variant: 'dndf', bukrs: 'IN11' }, deps)
    ok(result.ok)
    strictEqual(writes[1]?.fields['ZtsfDealType'], 'DS1')
  })

  it('still books a genuine DS2 model when its payment and settlement mappings support it', async () => {
    const { deps, rows, writes } = fakePorts()
    rows['tsfPay'] = [{ ZMOD_ID: 'M032', ZD2_BUKRS: 'OGA', ZD2_BCURR: 'INR' }]
    rows['setFx'] = rows['setFx']!.map((r) => ({ ...r, ZD_MAP: 'DS2', ZBUKRS: 'SG03' }))
    ok((await createNdfSpot(req, deps)).ok)
    strictEqual(writes[1]?.fields['ZtsfDealType'], 'DS2')
  })

  it('refuses incomplete or inconsistent model and settlement configuration before posting', async () => {
    for (const change of [
      (rows: Record<string, FxRow[]>) => { rows['tsfPay'] = [] },
      (rows: Record<string, FxRow[]>) => { rows['masterContract'] = [] },
      (rows: Record<string, FxRow[]>) => { rows['tsfDealId']![0]!.ZTSF_MODEL = 'M035' },
      (rows: Record<string, FxRow[]>) => { rows['setFx'] = rows['setFx']!.slice(0, 1) },
      (rows: Record<string, FxRow[]>) => { rows['setFx'] = rows['setFx']!.map((r) => ({ ...r, ZBUKRS: 'SG03' })) },
    ]) {
      const { deps, rows, writes } = fakePorts()
      change(rows)
      const result = await createNdfSpot({ ...req, bukrs: 'IN11' }, deps)
      ok(!result.ok)
      strictEqual(writes.length, 0)
    }
  })

  it('rechecks invoice data and source linkage at booking time', async () => {
    for (const change of [
      (f: ReturnType<typeof fakePorts>) => { f.rows['inSpot'] = [] },
      (f: ReturnType<typeof fakePorts>) => { f.rows['inSpot'] = [{ ...invoice, ZF_AMT: '1' }] },
      (f: ReturnType<typeof fakePorts>) => { f.rows['inSpot'] = [{ ...invoice, ZBS: 'Sell' }] },
      (f: ReturnType<typeof fakePorts>) => { f.app.ZtsfDealType = 'D1' },
    ]) {
      const f = fakePorts()
      change(f)
      ok(!(await createNdfSpot({ ...req, bukrs: 'IN11' }, f.deps)).ok)
      strictEqual(f.writes.length, 0)
    }
  })

  it('does not post when the configuration cannot be read', async () => {
    const { deps, writes } = fakePorts()
    deps.list = async () => { throw new Error('Configuration unavailable') }
    const result = await createNdfSpot({ ...req, bukrs: 'IN11' }, deps)
    ok(!result.ok && result.message.includes('Configuration unavailable'))
    strictEqual(writes.length, 0)
  })

  it('reports a saved SAP spot if saving its TSF append fails, without retrying creation', async () => {
    const { deps, writes } = fakePorts()
    deps.save = async () => { throw new Error('Append unavailable') }
    const result = await createNdfSpot({ ...req, bukrs: 'IN11' }, deps)
    ok(result.ok && result.appDataError?.includes('was created in SAP'))
    strictEqual(writes.length, 1)
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

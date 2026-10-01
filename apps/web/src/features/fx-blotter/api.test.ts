import { deepStrictEqual, ok, rejects, strictEqual, throws } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApiError } from '@slc/api-client'
import { createSpotDeal, fromFxTransaction, sapMessage, toCreatePayload, txnTypeOfProduct, type FxTransaction } from './api.ts'
import { BUSINESS_PARTNERS } from './data.ts'
import { MC_SEED_FIXTURE as MC_SEED, installFixtures } from './fixtures.ts'
import { applyCreated, autoSpotForm, buildMasterContracts, confirmAutoDeal, initAutoLegs, initialBlotter, mergeLiveRows, spotEntities, spotPartners, spotTxnOptions, txnTypeOptions } from './logic.ts'
import type { BlotterRow } from './types.ts'

// The running screen loads these lists from the middleware; the rules are tested against the values the lists used to hold.
installFixtures()

const draft = (over: Partial<BlotterRow> = {}): BlotterRow => ({
  id: 'R1',
  seq: 1,
  status: 'DRAFT',
  draftLabel: 'DRAFT-001',
  transactionNumber: '',
  group: 'G03',
  trader: 'TER',
  tradeDate: new Date(2026, 8, 30),
  entity: 'OGA',
  bp: '400000002',
  txnType: 'FWD',
  buySell: 'B',
  buySell2: 'S',
  curr1: 'USD',
  amt1: 1000,
  curr2: 'INR',
  amt2: 83000,
  spotRate: 83,
  swapPoints: 0,
  totalRate: 83,
  valueDate: new Date(2026, 9, 30),
  ndfDate: null,
  ndfRef: '',
  portfolio: 'TRADING',
  assignment: '360T',
  profitCenter: 'TSF-FX',
  businessArea: 'SINGAPORE',
  mcRef: '',
  dealId: '',
  dealType: '',
  fxModel: '',
  notes: '',
  ...over,
})

const sapDeal: FxTransaction = {
  CompanyCode: 'SG03',
  FinancialTransaction: '7000000000001',
  ProductType: '12B',
  TransactionType: '619',
  Partner: '400000002',
  ContractDate: '2026-09-30',
  BuyCurrency: 'USD',
  SellCurrency: 'INR',
  LeadCurrency: 'USD',
  FollowCurrency: 'INR',
  BuyAmount: 1000,
  SellAmount: 83000,
  ValueDate: '2026-10-30',
  SpotRate: 83,
  SwapRate: 0,
  ForwardRate: 83,
}

describe('toCreatePayload', () => {
  it('builds the body of the forward that SAP accepted', () => {
    deepStrictEqual(toCreatePayload(draft()), {
      CompanyCode: 'SG03',
      ProductType: '12B',
      TransactionType: '619',
      Partner: '400000002',
      ValuationClass: '0011',
      ContractDate: '2026-09-30',
      ValueDate: '2026-10-30',
      BuyCurrency: 'USD',
      SellCurrency: 'INR',
      BuyAmount: 1000,
      SellAmount: 83000,
      LeadCurrency: 'USD',
      FollowCurrency: 'INR',
      TradedCurrency: 'USD',
    })
  })

  it('maps every blotter type but Swap to the value-help product / transaction type', () => {
    const pair = (t: string) => { const p = toCreatePayload(draft({ txnType: t })); return `${p.ProductType}/${p.TransactionType}` }
    deepStrictEqual(['SPOT', 'TOM', 'FWD', 'NDF', 'DNDF'].map(pair), ['12A/609', '12A/602', '12B/619', '12D/631', '12D/632'])
  })

  it('maps Spot and NDF to their product / transaction types', () => {
    const spot = toCreatePayload(draft({ txnType: 'SPOT' }))
    strictEqual(spot.ProductType, '12A')
    strictEqual(spot.TransactionType, '609')
    const ndf = toCreatePayload(draft({ txnType: 'NDF' }))
    strictEqual(ndf.ProductType, '12D')
    strictEqual(ndf.TransactionType, '631')
  })

  it('swaps the legs when the blotter sells currency 1', () => {
    const p = toCreatePayload(draft({ buySell: 'S' }))
    strictEqual(p.BuyCurrency, 'INR')
    strictEqual(p.SellCurrency, 'USD')
    strictEqual(p.BuyAmount, 83000)
    strictEqual(p.SellAmount, 1000)
    strictEqual(p.TradedCurrency, 'USD')
  })

  it('rounds away floating-point noise in amount 2', () => {
    strictEqual(toCreatePayload(draft({ amt2: 83000.00000000001 })).SellAmount, 83000)
  })

  it('refuses a type SAP has no product for, before any call', () => {
    for (const t of ['SWAP']) throws(() => toCreatePayload(draft({ txnType: t })), /not available in SAP/)
  })

  it('refuses a row with a required field missing', () => {
    throws(() => toCreatePayload(draft({ bp: '' })), /Business Partner/)
    throws(() => toCreatePayload(draft({ valueDate: null })), /Value Date/)
    throws(() => toCreatePayload(draft({ entity: '' })), /Entity/)
  })
})

describe('fromFxTransaction', () => {
  const ctx = { group: 'G03', trader: 'TER' }

  it('turns a SAP forward into a created, live blotter row', () => {
    const out = fromFxTransaction(sapDeal, ctx, BUSINESS_PARTNERS)
    ok(out)
    const r = out.row
    strictEqual(r.status, 'CREATED')
    strictEqual(r.live, true)
    strictEqual(r.transactionNumber, '7000000000001')
    strictEqual(r.companyCode, 'SG03')
    strictEqual(r.entity, 'OGA')
    strictEqual(r.txnType, 'FWD')
    strictEqual(r.buySell, 'B')
    strictEqual(r.curr1, 'USD')
    strictEqual(r.amt1, 1000)
    strictEqual(r.amt2, 83000)
    strictEqual(r.totalRate, 83)
    strictEqual(r.tradeDate?.getDate(), 30)
    strictEqual(r.valueDate?.getMonth(), 9)
  })

  it('shows a deal SAP reports as reversed (ActiveStatus 3) as Reversed', () => {
    const out = fromFxTransaction({ ...sapDeal, ActiveStatus: '3' }, ctx, BUSINESS_PARTNERS)
    strictEqual(out?.row.status, 'REVERSED')
    strictEqual(fromFxTransaction({ ...sapDeal, ActiveStatus: '0' }, ctx, BUSINESS_PARTNERS)?.row.status, 'CREATED')
  })

  it('reads a deal that buys the follow currency as a sell', () => {
    const out = fromFxTransaction({ ...sapDeal, BuyCurrency: 'INR', SellCurrency: 'USD', BuyAmount: 83000, SellAmount: 1000 }, ctx, BUSINESS_PARTNERS)
    ok(out)
    strictEqual(out.row.buySell, 'S')
    strictEqual(out.row.amt1, 1000)
    strictEqual(out.row.amt2, 83000)
  })

  it('adds a partner the blotter does not know', () => {
    const out = fromFxTransaction({ ...sapDeal, Partner: '400000099' }, ctx, BUSINESS_PARTNERS)
    ok(out)
    ok(out.partners.some((p) => p.code === '400000099'))
    strictEqual(out.partners.length, BUSINESS_PARTNERS.length + 1)
  })

  it('skips deals of other company codes or unmapped products', () => {
    strictEqual(fromFxTransaction({ ...sapDeal, CompanyCode: '9800' }, ctx, BUSINESS_PARTNERS), null)
    strictEqual(fromFxTransaction({ ...sapDeal, ProductType: 'T60', TransactionType: 'TT6' }, ctx, BUSINESS_PARTNERS), null)
  })
})

describe('applyCreated / mergeLiveRows', () => {
  const start = () => initialBlotter(new Date(2026, 8, 30), buildMasterContracts(new Date(2026, 8, 30), MC_SEED), [...BUSINESS_PARTNERS])

  it('gives an accepted draft its SAP number and leaves the others alone', () => {
    const b = start()
    const [a, other] = b.rows.filter((r) => r.status === 'DRAFT')
    ok(a && other)
    const next = applyCreated({ ...b, checked: [a.id, other.id] }, new Map([[a.id, { companyCode: 'SG03', transaction: '7000000000009' }]]))
    const done = next.rows.find((r) => r.id === a.id)
    strictEqual(done?.status, 'CREATED')
    strictEqual(done?.transactionNumber, '7000000000009')
    strictEqual(done?.live, true)
    strictEqual(done?.companyCode, 'SG03')
    strictEqual(next.rows.find((r) => r.id === other.id)?.status, 'DRAFT')
    deepStrictEqual(next.checked, [other.id])
  })

  it('lists a SAP deal once however often the blotter loads', () => {
    const out = fromFxTransaction(sapDeal, { group: 'G03', trader: 'TER' }, BUSINESS_PARTNERS)
    ok(out)
    const once = mergeLiveRows(start(), [out.row], out.partners)
    const twice = mergeLiveRows(once, [out.row], out.partners)
    strictEqual(twice.rows.filter((r) => r.transactionNumber === '7000000000001').length, 1)
    ok(twice.rows.filter((r) => r.status === 'DRAFT' && !r.transactionNumber).length >= 10)
    strictEqual(new Set(twice.rows.map((r) => r.id)).size, twice.rows.length)
  })
})

describe('Create Spot', () => {
  const blotter = () => initialBlotter(new Date(2026, 8, 30), buildMasterContracts(new Date(2026, 8, 30), MC_SEED), [...BUSINESS_PARTNERS])

  it('offers only SG03 and AE13, and only partner 400000002', () => {
    deepStrictEqual(spotEntities().map((e) => e.cocode), ['SG03', 'AE13'])
    deepStrictEqual(spotPartners(blotter().partners).map((p) => p.code), ['400000002'])
  })

  it('lists the value-help transaction types with their product types', () => {
    const labels = spotTxnOptions().map((o) => o.label)
    strictEqual(labels.length, 11)
    strictEqual(labels[0], '12A 600 - FX Spot: External-Spot')
    ok(labels.includes('12B 619 - FX Forwards: External-Forward'))
    ok(labels.includes('12D 632 - FX NDF: External-DNDF - TSF'))
  })

  it('starts on an allowed company, the partner and the Spot transaction type (609)', () => {
    const f = autoSpotForm([], blotter())
    strictEqual(f.company, 'OGA')
    strictEqual(f.bp, '400000002')
    strictEqual(f.txnType, '609')
  })

  it('does not start on the selected row\'s entity when that company is not offered', () => {
    const b = blotter()
    const row = draft({ entity: 'OSIPL' })
    strictEqual(autoSpotForm([row], b).company, 'OGA')
    strictEqual(autoSpotForm([draft({ entity: 'DMCC' })], b).company, 'DMCC')
  })

  it('refuses an unusable form before any call', async () => {
    const f = autoSpotForm([], blotter())
    const ok1 = { ...f, buyAmt: '1,000.00', sellAmt: '83,000.00', tradeDate: '30-09-2026', valueDate: '02-10-2026' }
    await rejects(() => createSpotDeal({ ...ok1, buyAmt: '0.00' }), /greater than zero/)
    await rejects(() => createSpotDeal({ ...ok1, valueDate: '' }), /Value Date/)
    await rejects(() => createSpotDeal({ ...ok1, txnType: '' }), /Transaction Type/)
    await rejects(() => createSpotDeal({ ...ok1, company: '' }), /Company Code/)
  })
})

describe('SAP product types', () => {
  it('shows the product type in the grid dropdown', () => {
    const labels = txnTypeOptions().map((o) => o.label)
    ok(labels.includes('12A 609 - SPOT - Spot'))
    ok(labels.includes('12B 619 - FWD - Outright Forward'))
    ok(labels.includes('SWAP - FX Swap'))
  })

  it('reads deals by exact type, by family, and the earlier 40x deals', () => {
    strictEqual(txnTypeOfProduct('12B', '619'), 'FWD')
    strictEqual(txnTypeOfProduct('12D', '632'), 'DNDF')
    strictEqual(txnTypeOfProduct('12A', '609'), 'SPOT')
    strictEqual(txnTypeOfProduct('40A', '400'), 'FWD')
    strictEqual(txnTypeOfProduct('40D', '400'), 'NDF')
    strictEqual(txnTypeOfProduct('T60', 'TT6'), undefined)
  })
})

describe('sapMessage', () => {
  const err = (details: Array<{ code: string; message: string }>) =>
    new ApiError('BAPI processing was terminated', 400, { error: { message: 'BAPI processing was terminated', details } })

  it('gives SAP\'s cause, not the generic top-level message', () => {
    strictEqual(
      sapMessage(err([
        { code: 'FTR0/005', message: 'Number range 70 in company code SG03 does not exist' },
        { code: 'FTR0/161', message: 'BAPI processing was terminated' },
        { code: 'FTR0/030', message: 'No payment details entered for transaction' },
      ])),
      'Number range 70 in company code SG03 does not exist',
    )
  })

  it('falls back to the message when there are no causes', () => {
    strictEqual(sapMessage(err([{ code: 'FTR0/161', message: 'BAPI processing was terminated' }])), 'BAPI processing was terminated')
    strictEqual(sapMessage(new Error('boom')), 'boom')
  })
})

describe('Auto Deal in SAP', () => {
  const now = new Date(2026, 8, 30)
  const blotter = () => initialBlotter(now, buildMasterContracts(now, MC_SEED), [...BUSINESS_PARTNERS])

  it('starts both legs on the SAP partner, as forwards that map to a product type', () => {
    const mc = blotter().contracts.find((c) => c.mcNumber === 'MC-7001')!
    const legs = initAutoLegs(mc, now)
    strictEqual(legs.length, 2)
    for (const l of legs) {
      strictEqual(l.partner, '400000002')
      strictEqual(l.txnType, 'FWD')
    }
  })

  it('turns both legs into rows that SAP can be sent, Deal 1 first', () => {
    const b = blotter()
    const mc = b.contracts.find((c) => c.mcNumber === 'MC-7001')!
    const out = confirmAutoDeal(b, mc.mcNumber, initAutoLegs(mc, now))!
    const ids = out.blotter.deals[out.blotter.deals.length - 1]!.legs
    const rows = ids.map((id) => out.blotter.rows.find((r) => r.id === id)!)
    deepStrictEqual(rows.map((r) => r.dealType), ['Deal 1 (Auto Deal)', 'Deal 2 (Auto Deal)'])
    const payloads = rows.map(toCreatePayload)
    deepStrictEqual(payloads.map((p) => p.CompanyCode), ['SG03', 'AE13'])
    for (const p of payloads) {
      strictEqual(p.ProductType, '12B')
      strictEqual(p.TransactionType, '619')
      strictEqual(p.Partner, '400000002')
    }
  })

  it('names an Auto Deal leg, not a blank, when it cannot be sent', () => {
    throws(() => toCreatePayload({ ...draft({ txnType: 'SWAP' }), draftLabel: '', dealType: 'Deal 2 (Auto Deal)' }), /^Error: Deal 2 \(Auto Deal\): /)
  })
})

describe('mergeLiveRows keeps what only this screen knows', () => {
  const now = new Date(2026, 8, 30)
  const start = () => initialBlotter(now, buildMasterContracts(now, MC_SEED), [...BUSINESS_PARTNERS])
  const incoming = (status: 'CREATED' | 'REVERSED') => {
    const out = fromFxTransaction({ ...sapDeal, ActiveStatus: status === 'REVERSED' ? '3' : '0' }, { group: 'G03', trader: 'TER' }, BUSINESS_PARTNERS)
    ok(out)
    return out
  }

  it('does not wipe the Deal ID, Master Contract or release of a row already shown', () => {
    const first = incoming('CREATED')
    const b0 = mergeLiveRows(start(), [first.row], first.partners)
    const row = b0.rows.find((r) => r.transactionNumber === '7000000000001')!
    const linked = { ...b0, rows: b0.rows.map((r) => (r.id === row.id ? { ...r, status: 'RELEASED' as const, dealId: 'TSF-9080', mcRef: 'MC-7001' } : r)) }
    const again = incoming('CREATED')
    const b1 = mergeLiveRows(linked, [again.row], again.partners)
    const kept = b1.rows.find((r) => r.transactionNumber === '7000000000001')!
    strictEqual(kept.status, 'RELEASED')
    strictEqual(kept.dealId, 'TSF-9080')
    strictEqual(kept.mcRef, 'MC-7001')
    strictEqual(b1.rows.filter((r) => r.transactionNumber === '7000000000001').length, 1)
  })

  it('applies a reversal SAP reports to the row already shown', () => {
    const first = incoming('CREATED')
    const b0 = mergeLiveRows(start(), [first.row], first.partners)
    const rev = incoming('REVERSED')
    const b1 = mergeLiveRows(b0, [rev.row], rev.partners)
    strictEqual(b1.rows.find((r) => r.transactionNumber === '7000000000001')?.status, 'REVERSED')
  })
})

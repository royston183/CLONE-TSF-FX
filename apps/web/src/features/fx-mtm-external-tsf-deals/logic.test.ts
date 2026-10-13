import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { COLUMNS, DEAL_SEEDS, PAIRS } from './data.ts'
import {
  addDaysYmd,
  dayNumber,
  dmyToYmd,
  formatAmount,
  formatRate,
  isMonthEndYmd,
  lastDayOfMonth,
  normalizeDate,
  parseDMY,
  ymdToDmy,
} from './format.ts'
import {
  ACCOUNTING_TABLE,
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  applyGainLossSign,
  applySelectionCriteria,
  buildCsv,
  buildMtmMonths,
  canPostRow,
  cellText,
  clampPage,
  colClasses,
  computeSwapRate,
  csvFileName,
  determineAccounting,
  digitsOnly,
  documentTotals,
  emptyText,
  executeScreen,
  exportToastText,
  filterSortRows,
  freshScreen,
  getCompany,
  getVisibleColumns,
  hasErrors,
  jitter,
  loadAccountingDocument,
  loadAllDeals,
  loadMarketData,
  logSubtitle,
  mockSpot,
  nextBusinessDayBack,
  nextSort,
  pageSlice,
  postAll,
  postBlockReason,
  postButtonTitle,
  postDeal,
  postingBasis,
  postingContextOf,
  rateDp,
  recordCountText,
  swapDp,
  seedPostedHistory,
  showingText,
  statusClass,
  thbColumnActive,
  totalPages,
  validateKeyDate,
  validateParams,
  valuateDealsFor,
} from './logic.ts'

const KEY = '20260930'
const IN_CTX = { keyYmd: KEY, localCurrency: '' }

function firstRow(bukrs: string, rfha: string, store = seedPostedHistory()) {
  const row = valuateDealsFor(bukrs, KEY, store).find((r) => r.rfha === rfha)
  if (!row) throw new Error(`deal ${rfha} not in scope`)
  return row
}

describe('date helpers', () => {
  it('works on YYYYMMDD strings', () => {
    strictEqual(dayNumber('19700102'), 1)
    strictEqual(addDaysYmd('20260930', 1), '20261001')
    strictEqual(addDaysYmd('20260301', -1), '20260228')
    strictEqual(lastDayOfMonth(2028, 2), 29)
    strictEqual(isMonthEndYmd('20260930'), true)
    strictEqual(isMonthEndYmd('20260929'), false)
    strictEqual(ymdToDmy('20260930'), '30-09-2026')
    strictEqual(ymdToDmy(''), '')
    strictEqual(dmyToYmd('30-09-2026'), '20260930')
    strictEqual(dmyToYmd('31-02-2026'), '')
  })

  it('parseDMY rejects malformed and impossible dates', () => {
    strictEqual(parseDMY('31-02-2026'), null)
    strictEqual(parseDMY('1-2-2026'), null)
    strictEqual(parseDMY(''), null)
    strictEqual(parseDMY(' 30-09-2026 ')?.getMonth(), 8)
  })

  it('normalizeDate accepts the separators the original does', () => {
    strictEqual(normalizeDate('30.09.2026'), '30-09-2026')
    strictEqual(normalizeDate('30/09/2026'), '30-09-2026')
    strictEqual(normalizeDate('30092026'), '30-09-2026')
    strictEqual(normalizeDate('1-9-2026'), '01-09-2026')
    strictEqual(normalizeDate('  abc '), 'abc')
  })

  it('formats numbers with grouping and fixed decimals', () => {
    strictEqual(formatAmount(1234567.891), '1,234,567.89')
    strictEqual(formatAmount(-5), '-5.00')
    strictEqual(formatRate(90.5, 4), '90.5000')
  })
})

describe('mock market and deal generator', () => {
  it('has 48 deals, 25 for IN11, 14 for TH10 and 9 for VN10', () => {
    const deals = loadAllDeals()
    strictEqual(deals.length, 48)
    strictEqual(DEAL_SEEDS.length, 48)
    strictEqual(deals.filter((d) => d.bukrs === 'IN11').length, 25)
    strictEqual(deals.filter((d) => d.bukrs === 'TH10').length, 14)
    strictEqual(deals.filter((d) => d.bukrs === 'VN10').length, 9)
  })

  it('jitter stays within -1..1 and is deterministic', () => {
    for (let n = 1; n <= 50; n++) {
      const j = jitter(n)
      ok(j >= -1 && j <= 1)
      strictEqual(jitter(n), j)
    }
  })

  it('spot rates are deterministic and rounded to the pair decimals', () => {
    for (const p of PAIRS) {
      const s = mockSpot(p.code, KEY)
      strictEqual(s, mockSpot(p.code, KEY))
      strictEqual(Number(s.toFixed(p.dp)), s)
    }
    const m = loadMarketData(KEY)
    strictEqual(m.spots['USD-INR'], 90.5453)
    strictEqual(m.swaps['USD-INR']?.length, 14)
  })

  it('walks back business days over weekends', () => {
    strictEqual(nextBusinessDayBack('20261006', 2), '20261002')
    strictEqual(nextBusinessDayBack('20261002', 1), '20261001')
    strictEqual(nextBusinessDayBack('20261005', 1), '20261002')
  })

  it('derives transaction type, NDF fields and ids from the seed', () => {
    const deals = loadAllDeals()
    const fwd = deals.find((d) => d.rfha === '3000014801')
    const ndfTsf = deals.find((d) => d.rfha === '3000014817')
    const ndfOpen = deals.find((d) => d.rfha === '3000014819')
    ok(fwd && ndfTsf && ndfOpen)
    strictEqual(fwd.sfhaart, '625')
    strictEqual(fwd.xtext, '625 - FX Forward - TSF')
    strictEqual(fwd.ztsf_deal_id, 'TSF/IN/2026/14801')
    strictEqual(fwd.zolam_deal_no, 'OLM-0014801')
    strictEqual(fwd.amt1, -4500000)
    strictEqual(fwd.bs_o, '1')
    strictEqual(fwd.ndf_ref, '')
    strictEqual(ndfTsf.sfhaart, '631')
    strictEqual(ndfTsf.sgsart, '12D')
    strictEqual(ndfTsf.ndf_ref, 'NDF/IN11/014817')
    strictEqual(ndfTsf.ndf_date, '20260930')
    ok(ndfTsf.ndf_rate > 0)
    // The fixing date is after the system date, so there is no settlement rate yet.
    strictEqual(ndfOpen.ndf_rate, 0)
  })
})

describe('swap interpolation', () => {
  const months = buildMtmMonths(KEY)
  const curve = loadMarketData(KEY).swaps['USD-INR'] ?? []

  it('builds 60 month-end buckets after the key date', () => {
    strictEqual(months.length, 60)
    deepStrictEqual(months[0], { zmonth: 1, zmonth_date: '20261031', zmonth_days: 32 })
    deepStrictEqual(months[2], { zmonth: 3, zmonth_date: '20261231', zmonth_days: 93 })
    strictEqual(buildMtmMonths('20261231')[0]?.zmonth_date, '20270131')
  })

  it('gives the first bucket the 30-day point and later buckets interpolated points', () => {
    const first = computeSwapRate('20261027', KEY, months, curve)
    strictEqual(first.month, 1)
    strictEqual(first.rate, 0.17418)
    const second = computeSwapRate('20261130', KEY, months, curve)
    strictEqual(second.month, 2)
    ok(second.rate > first.rate)
  })

  it('reports month 0 and rate 0 for a value date beyond the 60 buckets', () => {
    deepStrictEqual(computeSwapRate('20400101', KEY, months, curve), { month: 0, rate: 0 })
  })
})

describe('gain/loss sign rules', () => {
  const base = {
    sgsart: '12F',
    ndf_rate: 0,
    ndf_date: '',
    delfz: '20261231',
    v_gl: 100,
    f_curr: 'INR',
    f_curr1: 'USD',
    curr1: 'USD',
    bs_1: 'Sell' as const,
    bs_2: 'Buy' as const,
    c_rate_n: 90,
    v_rate_n: 91,
  }

  it('is a gain when selling the foreign currency above the value rate', () => {
    // curr1 (USD) is not the foreign currency, so the second leg's side applies: Buy, rate not above -> loss.
    strictEqual(applyGainLossSign(base, KEY), -100)
    strictEqual(applyGainLossSign({ ...base, c_rate_n: 92 }, KEY), 100)
  })

  it('flips the leading-currency sign and the Buy/Sell branch', () => {
    const lead = { ...base, f_curr: 'EUR', f_curr1: 'EUR', curr1: 'EUR', bs_1: 'Buy' as const }
    strictEqual(applyGainLossSign(lead, KEY), 100) // -100 from the leading currency, flipped back by Buy / rate not above
    strictEqual(applyGainLossSign({ ...lead, c_rate_n: 92 }, KEY), -100)
    strictEqual(applyGainLossSign({ ...lead, bs_1: 'Sell' as const }, KEY), -100) // Sell with the rate not above: no flip
  })

  it('compares a fixed NDF with its settlement rate once the key date has reached the fixing', () => {
    const ndf = { ...base, sgsart: '12D', ndf_rate: 95, ndf_date: '20260929', delfz: '20261001' }
    // Fixed: compare 90 with 95 (not above) -> loss; before fixing would compare 90 with 91 -> also loss, so vary the rate.
    strictEqual(applyGainLossSign({ ...ndf, c_rate_n: 93, v_rate_n: 91 }, KEY), -100)
    // Not yet fixed at this key date: compares with the value rate, where 93 is above 91.
    strictEqual(applyGainLossSign({ ...ndf, c_rate_n: 93, v_rate_n: 91, ndf_date: '20261002' }, KEY), 100)
  })
})

describe('valuation', () => {
  it('values a deal for a key date', () => {
    const r = firstRow('IN11', '3000014801')
    strictEqual(r.c_rate, 90.3464)
    strictEqual(r.v_spot, 90.5453)
    strictEqual(r.v_swap, 0.17418)
    strictEqual(r.usd_amt, 4500000)
    strictEqual(r.v_amt, 4481493.94)
    strictEqual(r.v_gl, -18506.06)
    strictEqual(r.v_gl_th, -1678860.14)
    strictEqual(r.monat, 1)
    strictEqual(r.month, 'Oct 2026')
    strictEqual(r.f_curr, 'INR')
    strictEqual(r.bs_bu, 'Sell')
    strictEqual(r.ext_stat_desc, '03 - Confirmed')
    strictEqual(r.landx50, 'India')
  })

  it('uses the NDF settlement rate once a deal has fixed', () => {
    const fixed = firstRow('IN11', '3000014816')
    strictEqual(fixed.ndf_date, '20260929')
    strictEqual(fixed.ndf_rate, 90.6077)
    strictEqual(fixed.v_gl, 36841.24)
    const open = firstRow('IN11', '3000014819')
    strictEqual(open.ndf_rate, 0)
    strictEqual(open.v_rate, open.v_spot + open.v_swap)
  })

  it('keeps the deals active at the key date only (trade date <= key date < value date)', () => {
    const rows = valuateDealsFor('IN11', KEY, seedPostedHistory())
    strictEqual(rows.length, 23)
    ok(!rows.some((r) => r.rfha === '3000014806')) // value date is the key date
    ok(!rows.some((r) => r.rfha === '3000014808')) // already matured
    const sorted = rows.map((r) => r.rfha)
    deepStrictEqual(sorted, [...sorted].sort())
    strictEqual(valuateDealsFor('TH10', KEY, seedPostedHistory()).length, 13)
    strictEqual(valuateDealsFor('VN10', KEY, seedPostedHistory()).length, 9)
    strictEqual(valuateDealsFor('IN11', '20260101', seedPostedHistory()).length, 0)
  })

  it('shows the seeded posting history against the matching key date only', () => {
    const store = seedPostedHistory()
    const sep = valuateDealsFor('IN11', KEY, store)
    deepStrictEqual(
      sep.filter((r) => r.mtm_doc).map((r) => [r.rfha, r.mtm_doc, r.rev_doc, r.msg]),
      [
        ['3000014801', '4900016506', '4900016507', 'Document Posted Sucessfully'],
        ['3000014812', '4900016508', '4900016509', 'Document Posted Sucessfully'],
      ],
    )
    // 3000014808 had already matured by 31-08-2026, so only three of the four seeded deals are in scope.
    strictEqual(valuateDealsFor('IN11', '20260831', store).filter((r) => r.mtm_doc).length, 3)
    strictEqual(valuateDealsFor('IN11', '20261031', store).filter((r) => r.mtm_doc).length, 0)
    strictEqual(Object.keys(store.docs).length, 14)
    strictEqual(store.nextDoc, 4900016514)
  })
})

describe('selection criteria', () => {
  const store = seedPostedHistory()
  const inRows = valuateDealsFor('IN11', KEY, store)
  const thRows = valuateDealsFor('TH10', KEY, store)

  it('applies the Deal No and Counterparty ranges inclusively', () => {
    const f = { ...DEFAULT_FILTERS, dealFrom: '3000014805', dealTo: '3000014810' }
    deepStrictEqual(
      applySelectionCriteria(inRows, f, 'IN11').map((r) => r.rfha),
      ['3000014805', '3000014807', '3000014809', '3000014810'],
    )
    const bp = applySelectionCriteria(inRows, { ...DEFAULT_FILTERS, bpFrom: '1000000110', bpTo: '1000000110' }, 'IN11')
    ok(bp.length > 0 && bp.every((r) => r.kontrh === '1000000110'))
  })

  it('filters by currency pair and NDF deal type', () => {
    ok(applySelectionCriteria(inRows, { ...DEFAULT_FILTERS, pair: 'EUR-USD' }, 'IN11').every((r) => r.cpair === 'EUR-USD'))
    const ndf = applySelectionCriteria(inRows, { ...DEFAULT_FILTERS, dealType: 'ndf' }, 'IN11')
    strictEqual(ndf.length, 5)
    ok(ndf.every((r) => r.sgsart === '12D'))
  })

  it('"Deliverable Deals" removes nothing, as in the ABAP', () => {
    strictEqual(applySelectionCriteria(inRows, { ...DEFAULT_FILTERS, dealType: 'deliverable' }, 'IN11').length, inRows.length)
  })

  it('splits TH10 by source DE6 / DE2 but leaves other companies alone', () => {
    const de6 = applySelectionCriteria(thRows, { ...DEFAULT_FILTERS, source: 'DE6' }, 'TH10')
    const de2 = applySelectionCriteria(thRows, { ...DEFAULT_FILTERS, source: 'DE2' }, 'TH10')
    ok(de6.length > 0 && de6.every((r) => r.tsf_code === 'DE6'))
    ok(de2.length > 0 && de2.every((r) => r.tsf_code !== 'DE6'))
    strictEqual(de6.length + de2.length, thRows.length)
    strictEqual(applySelectionCriteria(inRows, { ...DEFAULT_FILTERS, source: 'DE2' }, 'IN11').length, inRows.length)
  })
})

describe('accounting determination', () => {
  it('has a row per company, gain/loss and posting kind, and no VN10 external loss cash-traded row', () => {
    strictEqual(ACCOUNTING_TABLE.length, 29)
    ok(!ACCOUNTING_TABLE.some((a) => a.zbukrs === 'VN10' && a.type === 'ML' && a.acc_cat === 'CT'))
    ok(ACCOUNTING_TABLE.some((a) => a.zbukrs === 'VN10' && a.type === 'MG' && a.acc_cat === 'CT'))
  })

  it('picks TSF accounting for TSF transaction types and external accounting otherwise', () => {
    const tsfLoss = determineAccounting(firstRow('IN11', '3000014801')) // TSF forward, loss
    strictEqual(tsfLoss.doc_header, 'FX MTM TSF Loss')
    strictEqual(tsfLoss.gl_debit, '78200400')
    strictEqual(tsfLoss.gl_credit, '25800400')
    const extGain = determineAccounting(firstRow('IN11', '3000014804')) // external forward, gain, cash traded
    strictEqual(extGain.doc_header, 'FX MTM External CT Gain')
    strictEqual(extGain.gl_debit, '15800200')
    strictEqual(extGain.gl_credit, '78100200')
    const ndf = determineAccounting(firstRow('IN11', '3000014816')) // external NDF, gain
    strictEqual(ndf.doc_header, 'FX MTM External NDF Gain')
  })

  it('returns an empty row when no account is maintained', () => {
    const r = firstRow('VN10', '3000034803') // external, loss, cash traded
    strictEqual(r.v_gl < 0, true)
    strictEqual(determineAccounting(r).gl_debit, '')
  })
})

describe('posting', () => {
  it('posts an MTM document and its reversal', () => {
    const store = seedPostedHistory()
    const row = firstRow('IN11', '3000014803')
    ok(canPostRow(row))
    const res = postDeal(row, IN_CTX, store)
    strictEqual(res.msgs.length, 2)
    deepStrictEqual(
      res.msgs.map((m) => [m.ok, m.rfha, m.doc, m.message]),
      [
        [true, '3000014803', '4900016514', 'Document Posted Sucessfully'],
        [true, '3000014803', '4900016515', 'Document Posted Sucessfully'],
      ],
    )
    strictEqual(res.row.mtm_doc, '4900016514')
    strictEqual(res.row.rev_doc, '4900016515')
    strictEqual(res.row.msg, 'Document Posted Sucessfully')
    strictEqual(canPostRow(res.row), false)
    strictEqual(res.msgs[0]?.diff, row.v_gl)
    strictEqual(res.msgs[0]?.cswap_rate, row.c_rate)
    strictEqual(res.store.nextDoc, store.nextDoc + 2)
    // The store is immutable: the input is untouched.
    strictEqual(loadAccountingDocument(store, '4900016514'), null)

    const mtm = loadAccountingDocument(res.store, '4900016514')
    const rev = loadAccountingDocument(res.store, '4900016515')
    ok(mtm && rev)
    strictEqual(mtm.header.doc_type, 'TS') // DE2 deals use document type TS
    strictEqual(mtm.header.pstng_date, KEY)
    strictEqual(mtm.header.ref_doc_no, '3000014803')
    strictEqual(mtm.items[0]?.gl_account, '0078200100') // external FV loss: debit the P&L loss account
    strictEqual(mtm.items[1]?.gl_account, '0025800100') // credit the MTM liability account
    strictEqual(mtm.items[0]?.amount, Math.abs(row.v_gl))
    strictEqual(mtm.items[1]?.amount, -Math.abs(row.v_gl))
    strictEqual(rev.reversalOf, '4900016514')
    strictEqual(rev.reversalReason, '02')
    strictEqual(rev.header.pstng_date, '20261001')
    strictEqual(rev.year, '2026')
    strictEqual(rev.items[0]?.amount, -(mtm.items[0]?.amount ?? 0))
    deepStrictEqual(documentTotals(mtm.items), { debit: Math.abs(row.v_gl), credit: Math.abs(row.v_gl) })
    // The posting is remembered for that key date, so a re-run shows it.
    const again = valuateDealsFor('IN11', KEY, res.store).find((r) => r.rfha === '3000014803')
    strictEqual(again?.mtm_doc, '4900016514')
  })

  it('pads the G/L account to ten digits', () => {
    const store = seedPostedHistory()
    const res = postDeal(firstRow('IN11', '3000014803'), IN_CTX, store)
    const mtm = loadAccountingDocument(res.store, res.row.mtm_doc)
    strictEqual(mtm?.items[0]?.gl_account.length, 10)
  })

  it('posts TH10 / DE2 deals in the local currency with document type TS', () => {
    const store = seedPostedHistory()
    const row = valuateDealsFor('TH10', KEY, store).find((r) => r.tsf_code === 'DE2' && canPostRow(r))
    ok(row)
    const ctx = { keyYmd: KEY, localCurrency: 'THB' }
    deepStrictEqual(postingBasis(row, ctx), { currency: 'THB', amount: row.v_gl_th, thb: true })
    deepStrictEqual(postingBasis({ ...row, tsf_code: 'DE6' }, ctx), { currency: 'USD', amount: row.v_gl, thb: false })
    const res = postDeal(row, ctx, store)
    const mtm = loadAccountingDocument(res.store, res.row.mtm_doc)
    strictEqual(mtm?.header.doc_type, 'TS')
    strictEqual(mtm?.items[0]?.currency, 'THB')
    strictEqual(res.msgs[0]?.diff, row.v_gl_th)
  })

  it('reports an error row and posts nothing when the account is not maintained', () => {
    const store = seedPostedHistory()
    const row = firstRow('VN10', '3000034803', store)
    const res = postDeal(row, IN_CTX, store)
    deepStrictEqual(
      res.msgs.map((m) => [m.ok, m.doc, m.message]),
      [[false, '', 'Account Value is not maintained.']],
    )
    strictEqual(res.row, row)
    strictEqual(res.store, store)
  })

  it('posts every eligible deal of the scope and skips posted ones', () => {
    const store = seedPostedHistory()
    const dataset = valuateDealsFor('VN10', KEY, store)
    const res = postAll(dataset, dataset, IN_CTX, store)
    // 9 deals, one already posted: 8 attempts, 2 of which fail the account lookup.
    strictEqual(res.msgs.length, 6 * 2 + 2)
    strictEqual(res.msgs.filter((m) => !m.ok).length, 2)
    strictEqual(res.dataset.filter((r) => r.mtm_doc).length, 7)
    strictEqual(res.dataset.length, dataset.length)
    const none = postAll(res.dataset, [], IN_CTX, res.store)
    strictEqual(none.msgs.length, 0)
  })

  it('explains why a deal cannot be posted', () => {
    strictEqual(postBlockReason(null), 'Select a deal to post.')
    strictEqual(postBlockReason({ mtm_doc: '1', v_gl: 5 }), 'This deal already has an MTM document.')
    strictEqual(postBlockReason({ mtm_doc: '', v_gl: 0 }), 'This deal has no valuation gain/loss to post.')
    strictEqual(postBlockReason({ mtm_doc: '', v_gl: 5 }), '')
    strictEqual(postButtonTitle({ mtm_doc: '', v_gl: 5, rfha: '3000014803' }), 'Post MTM document for deal 3000014803')
    strictEqual(postButtonTitle(null), 'Select a deal to post.')
  })
})

describe('Execute', () => {
  it('opens on IN11 / 30-09-2026 with the seeded history and no message log', () => {
    const s = freshScreen()
    deepStrictEqual(s.executed, { bukrs: 'IN11', keyYmd: KEY, localCurrency: '', th10: false })
    strictEqual(s.dataset.length, 23)
    strictEqual(s.msgLog.length, 0)
    deepStrictEqual(s.filters, DEFAULT_FILTERS)
    strictEqual(s.dataset.filter((r) => r.mtm_doc).length, 2)
  })

  it('"View With FI Posting" posts the whole scope and fills the message log', () => {
    const s = freshScreen()
    const res = executeScreen({ bukrs: 'VN10', keyDate: '30-09-2026', posting: 'post' }, s.executed, s.filters, s.store)
    strictEqual(res.msgLog.length, 6 * 2 + 2 + 0)
    ok(res.dataset.every((r) => r.mtm_doc || r.v_gl === 0 || r.msg === ''))
    strictEqual(res.dataset.filter((r) => r.mtm_doc).length, 7)
    strictEqual(res.store.nextDoc > s.store.nextDoc, true)
  })

  it('"View Only" never posts', () => {
    const s = freshScreen()
    const res = executeScreen({ bukrs: 'TH10', keyDate: '31-10-2026', posting: 'view' }, s.executed, s.filters, s.store)
    strictEqual(res.msgLog.length, 0)
    strictEqual(res.store, s.store)
    strictEqual(res.executed.th10, true)
    strictEqual(res.executed.localCurrency, 'THB')
  })

  it('puts the DE2/DE6 radio back on DE6 only when the company changes', () => {
    const s = freshScreen()
    const de2 = { ...s.filters, source: 'DE2' }
    strictEqual(executeScreen({ bukrs: 'IN11', keyDate: '31-10-2026', posting: 'view' }, s.executed, de2, s.store).filters.source, 'DE2')
    strictEqual(executeScreen({ bukrs: 'TH10', keyDate: '30-09-2026', posting: 'view' }, s.executed, de2, s.store).filters.source, 'DE6')
  })

  it('only posts the deals the selection criteria leave in scope', () => {
    const s = freshScreen()
    const filters = { ...DEFAULT_FILTERS, pair: 'USD-VND', dealType: 'ndf' as const }
    const res = executeScreen({ bukrs: 'VN10', keyDate: '30-09-2026', posting: 'post' }, s.executed, filters, s.store)
    strictEqual(res.msgLog.length, 4) // the two VND NDFs, each with an MTM and a reversal document
    ok(res.msgLog.every((m) => m.ok))
  })

  it('refuses a company that does not exist', () => {
    const s = freshScreen()
    let message = ''
    try {
      executeScreen({ bukrs: 'XX99', keyDate: '30-09-2026', posting: 'view' }, null, s.filters, s.store)
    } catch (e) {
      message = e instanceof Error ? e.message : ''
    }
    strictEqual(message, 'Unknown company code XX99')
  })
})

describe('run parameter validation', () => {
  it('validates the Key Date', () => {
    strictEqual(validateKeyDate(''), 'Key Date is required')
    strictEqual(validateKeyDate('   '), 'Key Date is required')
    strictEqual(validateKeyDate('30/09/2026'), 'Enter a valid date (dd-mm-yyyy)')
    strictEqual(validateKeyDate('31-02-2026'), 'Enter a valid date (dd-mm-yyyy)')
    strictEqual(validateKeyDate('29-09-2026'), 'Key Date Should be Month End Date only')
    strictEqual(validateKeyDate('30-09-2026'), '')
    strictEqual(validateKeyDate(' 28-02-2028 '), 'Key Date Should be Month End Date only')
    strictEqual(validateKeyDate('29-02-2028'), '')
  })

  it('requires a company code and a valid key date together', () => {
    deepStrictEqual(validateParams('', ''), { bukrs: 'Company Code is required', keyDate: 'Key Date is required' })
    deepStrictEqual(validateParams('IN11', '30-09-2026'), { bukrs: '', keyDate: '' })
    strictEqual(hasErrors(validateParams('', '30-09-2026')), true)
    strictEqual(hasErrors(validateParams('IN11', '30-09-2026')), false)
  })

  it('knows the allowed companies and which one has a local currency', () => {
    strictEqual(getCompany('TH10')?.localCurrency, 'THB')
    strictEqual(getCompany('IN11')?.localCurrency, '')
    strictEqual(getCompany('XX99'), null)
  })
})

describe('layouts and columns', () => {
  it('shows the columns of the chosen layout', () => {
    strictEqual(getVisibleColumns('', false).length, 24)
    strictEqual(getVisibleColumns('/FULL', false).length, 45)
    strictEqual(getVisibleColumns('/VALUATION', false).length, 16)
    strictEqual(getVisibleColumns('/VALUATION', true).length, 17)
    strictEqual(getVisibleColumns('unknown', false).length, 24)
  })

  it('shows the THB column only for a local-currency company with source DE2', () => {
    const th = { bukrs: 'TH10', keyYmd: KEY, localCurrency: 'THB', th10: true }
    const inr = { bukrs: 'IN11', keyYmd: KEY, localCurrency: '', th10: false }
    strictEqual(thbColumnActive(th, { ...DEFAULT_FILTERS, source: 'DE2' }), true)
    strictEqual(thbColumnActive(th, { ...DEFAULT_FILTERS, source: 'DE6' }), false)
    strictEqual(thbColumnActive(inr, { ...DEFAULT_FILTERS, source: 'DE2' }), false)
    strictEqual(thbColumnActive(null, { ...DEFAULT_FILTERS, source: 'DE2' }), false)
  })

  it('colours the two column groups and right-aligns numbers', () => {
    const col = (key: string) => {
      const c = COLUMNS.find((x) => x.key === key)
      if (!c) throw new Error(key)
      return c
    }
    strictEqual(colClasses(col('f_amt')), 'num mono t-ext')
    strictEqual(colClasses(col('v_gl')), 'num mono t-mtm')
    strictEqual(colClasses(col('dblfz')), 'mono')
    strictEqual(colClasses(col('bp_name')), '')
  })

  it('renders cells the way the list, search and CSV see them', () => {
    const r = firstRow('IN11', '3000014816')
    const col = (key: string) => COLUMNS.find((x) => x.key === key)
    const text = (key: string) => {
      const c = col(key)
      if (!c) throw new Error(key)
      return cellText(r, c)
    }
    strictEqual(text('rfha'), '3000014816')
    strictEqual(text('dblfz'), '10-06-2026')
    strictEqual(text('delfz'), '01-10-2026')
    strictEqual(text('amt1'), '-3,000,000.00')
    strictEqual(text('c_rate_n'), formatRate(r.c_rate, 4))
    strictEqual(text('v_swap_n'), formatRate(r.v_swap_n, 5))
    strictEqual(text('ndf_rate'), '90.6077')
    strictEqual(text('month'), 'Oct 2026')
    strictEqual(cellText(firstRow('IN11', '3000014819'), col('ndf_rate') ?? COLUMNS[0]!), '')
    strictEqual(text('mtm_doc'), '')
    strictEqual(rateDp({ cpair: 'USD-VND' }), 4)
    strictEqual(rateDp({ cpair: 'EUR-USD' }), 4)
    strictEqual(swapDp({ cpair: 'USD-INR' }), 5)
    strictEqual(swapDp({ cpair: 'EUR-USD' }), 6)
  })

  it('classifies status text by its code', () => {
    strictEqual(statusClass('03 - Confirmed'), 'status-text-ok')
    strictEqual(statusClass('04 - Fixed'), 'status-text-info')
    strictEqual(statusClass('08 - Amended'), 'status-text-warn')
    strictEqual(statusClass(''), 'status-text-warn')
  })
})

describe('search, sort and paging', () => {
  const store = seedPostedHistory()
  const rows = valuateDealsFor('IN11', KEY, store)
  const cols = getVisibleColumns('', false)

  it('searches the visible columns case-insensitively', () => {
    deepStrictEqual(
      filterSortRows(rows, cols, 'sbi-not-there', DEFAULT_SORT).map((r) => r.rfha),
      [],
    )
    const hsbc = filterSortRows(rows, cols, '  hsbc ', DEFAULT_SORT)
    ok(hsbc.length > 0 && hsbc.every((r) => r.bp_name.includes('HSBC')))
    // Counterparty id is not a default-layout column, so it is not searched there...
    strictEqual(filterSortRows(rows, cols, '1000000110', DEFAULT_SORT).length, 0)
    // ...but it is in the full layout.
    ok(filterSortRows(rows, getVisibleColumns('/FULL', false), '1000000110', DEFAULT_SORT).length > 0)
    // A formatted document number is found by the Message / MTM Doc columns.
    strictEqual(filterSortRows(rows, cols, '4900016506', DEFAULT_SORT).length, 1)
  })

  it('sorts text, numbers and dates, with deal number as the tie-break', () => {
    const asc = filterSortRows(rows, cols, '', { field: 'v_gl', dir: 'asc' })
    for (let i = 1; i < asc.length; i++) ok((asc[i - 1]?.v_gl ?? 0) <= (asc[i]?.v_gl ?? 0))
    const desc = filterSortRows(rows, cols, '', { field: 'v_gl', dir: 'desc' })
    strictEqual(desc[0]?.rfha, asc[asc.length - 1]?.rfha)
    // "Exp Mth-yr" sorts by value date, not by its text.
    const exp = filterSortRows(rows, cols, '', { field: 'month', dir: 'asc' })
    for (let i = 1; i < exp.length; i++) ok((exp[i - 1]?.delfz ?? '') <= (exp[i]?.delfz ?? ''))
    const byPair = filterSortRows(rows, cols, '', { field: 'cpair', dir: 'asc' })
    const sameFirst = byPair.filter((r) => r.cpair === byPair[0]?.cpair).map((r) => r.rfha)
    deepStrictEqual(sameFirst, [...sameFirst].sort())
  })

  it('clicking a header sorts ascending, again flips it', () => {
    deepStrictEqual(nextSort(DEFAULT_SORT, 'cpair'), { field: 'cpair', dir: 'asc' })
    deepStrictEqual(nextSort({ field: 'cpair', dir: 'asc' }, 'cpair'), { field: 'cpair', dir: 'desc' })
    deepStrictEqual(nextSort({ field: 'cpair', dir: 'desc' }, 'cpair'), { field: 'cpair', dir: 'asc' })
  })

  it('pages the list', () => {
    strictEqual(totalPages(0, 20), 1)
    strictEqual(totalPages(23, 20), 2)
    strictEqual(clampPage(5, 23, 20), 2)
    strictEqual(clampPage(1, 0, 20), 1)
    strictEqual(pageSlice(rows, 2, 20).length, 3)
    strictEqual(showingText(1, 20, 23), 'Showing 1–20 of 23')
    strictEqual(showingText(2, 20, 23), 'Showing 21–23 of 23')
    strictEqual(showingText(1, 20, 0), 'Showing 0–0 of 0')
    strictEqual(recordCountText(1), '1 deal')
    strictEqual(recordCountText(0), '0 deals')
    strictEqual(recordCountText(23), '23 deals')
  })

  it('has its own empty message for an empty book and an over-filtered one', () => {
    strictEqual(emptyText(0), 'No deals are active for this company code and key date.')
    strictEqual(emptyText(3), 'No deals match your search or filters.')
  })

  it('range boxes keep digits only', () => {
    strictEqual(digitsOnly('30-00ab14'), '300014')
    strictEqual(digitsOnly(''), '')
  })
})

describe('export, log and document helpers', () => {
  const store = seedPostedHistory()
  const rows = valuateDealsFor('IN11', KEY, store).slice(0, 2)

  it('exports the visible columns as quoted CSV', () => {
    const cols = getVisibleColumns('/VALUATION', false)
    const csv = buildCsv(cols, rows)
    const lines = csv.split('\r\n')
    strictEqual(lines.length, 3)
    strictEqual(lines[0], cols.map((c) => `"${c.label}"`).join(','))
    ok(lines[1]?.startsWith('"3000014801","03 - Confirmed"'))
    strictEqual(buildCsv(cols, []), lines[0])
  })

  it('doubles quotes inside a CSV value', () => {
    const cols = getVisibleColumns('', false).filter((c) => c.key === 'bp_name')
    const [first] = rows
    ok(first)
    strictEqual(buildCsv(cols, [{ ...first, bp_name: 'A "B" C' }]).split('\r\n')[1], '"A ""B"" C"')
  })

  it('names the file and the toast', () => {
    strictEqual(csvFileName({ bukrs: 'IN11', keyYmd: KEY }), 'FX_MTM_IN11_30-09-2026.csv')
    strictEqual(exportToastText(1, 'a.csv'), 'Exported 1 deal to a.csv')
    strictEqual(exportToastText(23, 'a.csv'), 'Exported 23 deals to a.csv')
  })

  it('words the Message Log subtitle', () => {
    strictEqual(logSubtitle({ bukrs: 'IN11', keyYmd: KEY }, 1), 'IN11 · Key Date 30-09-2026 · 1 message')
    strictEqual(logSubtitle({ bukrs: 'IN11', keyYmd: KEY }, 0), 'IN11 · Key Date 30-09-2026 · 0 messages')
  })

  it('totals debit and credit', () => {
    deepStrictEqual(documentTotals([{ amount: 10.5 }, { amount: -10.5 }, { amount: 2 }]), { debit: 12.5, credit: 10.5 })
    deepStrictEqual(documentTotals([]), { debit: 0, credit: 0 })
  })

  it('knows the posting context of an Execute', () => {
    deepStrictEqual(postingContextOf({ bukrs: 'TH10', keyYmd: KEY, localCurrency: 'THB', th10: true }), {
      keyYmd: KEY,
      localCurrency: 'THB',
    })
    strictEqual(lastDayOfMonth(2026, 9), 30)
  })
})

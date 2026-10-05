import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BUSINESS_PARTNERS } from './data.ts'
import { MC_SEED_FIXTURE as MC_SEED, installFixtures } from './fixtures.ts'
import { fmtCompactUsd, fmtDate, fmtNum, parseGridDate, parseUiDate } from './format.ts'
import {
  assignCheck,
  assignMc,
  assignToDeal,
  autoEligible,
  autoOrigins,
  buildMasterContracts,
  canonicalUploadRow,
  changeGroup,
  checkedRows,
  computeKpis,
  confirmAutoDeal,
  confirmShortStraddle,
  copyRow,
  createDrafts,
  deleteDrafts,
  editDate,
  editField,
  filterRows,
  hardReset,
  initAutoLegs,
  initialBlotter,
  isCompletelyBlankDraft,
  isPreassigned,
  listPnl,
  loadContext,
  mapUploadBuySell,
  mapUploadTxnType,
  mcCandidates,
  nextWorkingDay,
  pairCheck,
  parseDelimitedUpload,
  processUpload,
  releaseRows,
  resultBadge,
  reverseTxn,
  runTxnList,
  sampleUploadRows,
  settle,
  sortRows,
  splitDelimitedLine,
  toleranceCheck,
  toolbarState,
  updateAutoLeg,
  uploadBpCode,
  validateAutoLegs,
  validateCreate,
  validateUploadRows,
  workingDaysBetween,
} from './logic.ts'
import type { Blotter, BlotterRow } from './types.ts'

// The running screen loads these lists from the middleware; the rules are tested against the values the lists used to hold.
installFixtures()

// A Friday; Monday 26-10-2026 is 31 days on, so the seeded legs value on 27 and 28 October.
const NOW = new Date(2026, 8, 25)
const fresh = (): Blotter => initialBlotter(NOW, buildMasterContracts(NOW, MC_SEED), [...BUSINESS_PARTNERS])
const created = (b: Blotter) => b.rows.filter((r) => r.status === 'CREATED')
const row = (b: Blotter, id: string): BlotterRow => b.rows.find((r) => r.id === id)!
const firstBlank = (b: Blotter): BlotterRow => b.rows.find(isCompletelyBlankDraft)!
const BY_SEQ = { key: 'seq', dir: -1 } as const

describe('format', () => {
  it('formats numbers and dates the page way', () => {
    strictEqual(fmtNum(1234567.5), '1,234,567.50')
    strictEqual(fmtNum(83.2, 4), '83.2000')
    strictEqual(fmtNum(''), '0.00')
    strictEqual(fmtNum(Number.NaN), '')
    strictEqual(fmtDate(NOW), '25-09-2026')
    strictEqual(fmtCompactUsd(5_000_000), '$5.00M')
    strictEqual(fmtCompactUsd(1_250), '$1.3K')
  })

  it('reads grid dates strictly and popup dates in three shapes', () => {
    strictEqual(parseGridDate('2026-09-25'), null)
    strictEqual(fmtDate(parseGridDate('01-10-2026')), '01-10-2026')
    strictEqual(fmtDate(parseUiDate('01.10.2026')), '01-10-2026')
    strictEqual(fmtDate(parseUiDate('2026-10-01')), '01-10-2026')
    strictEqual(parseUiDate('1/10/2026'), null)
  })
})

describe('calendar', () => {
  it('skips weekends and the static holidays', () => {
    strictEqual(fmtDate(nextWorkingDay(new Date(2026, 8, 26))), '28-09-2026')
    strictEqual(fmtDate(nextWorkingDay(new Date(2026, 9, 2))), '05-10-2026')
    strictEqual(workingDaysBetween(new Date(2026, 8, 25), new Date(2026, 9, 5)), 5)
  })
})

describe('load context', () => {
  it('seeds two Created M021 legs and ten empty rows', () => {
    const b = fresh()
    strictEqual(b.rows.length, 12)
    deepStrictEqual(
      created(b).map((r) => r.transactionNumber),
      ['8100001', '8100002'],
    )
    strictEqual(b.rows.filter(isCompletelyBlankDraft).length, 10)
    const [d1, d2] = created(b)
    strictEqual(d1?.entity, 'OGA')
    strictEqual(d1?.buySell, 'S')
    strictEqual(d2?.buySell2, 'S')
    strictEqual(fmtDate(d1?.valueDate), '27-10-2026')
    strictEqual(d1?.amt2, 2500000 * 83.2)
    strictEqual(d1?.profitCenter, 'TSF-FX')
    strictEqual(d2?.businessArea, 'OLAM INTERNATIONAL DMCC')
    strictEqual(b.ctx.trader, 'NID')
  })

  it('draws new RFHA numbers on every load', () => {
    const b = loadContext(fresh()).blotter
    deepStrictEqual(
      created(b).map((r) => r.transactionNumber),
      ['8100003', '8100004'],
    )
    deepStrictEqual(b.checked, [])
  })

  it('changing group picks its first trader', () => {
    deepStrictEqual(changeGroup(fresh(), 'G03').ctx, { ...fresh().ctx, group: 'G03', trader: 'TER' })
  })
})

describe('grid editing', () => {
  it('fills a blank draft from the edited field and tops the grid back up to ten blanks', () => {
    const b = fresh()
    const id = firstBlank(b).id
    const next = settle(editField(b, id, 'curr1', 'USD'))
    const r = row(next, id)
    strictEqual(r.curr2, 'INR')
    strictEqual(r.totalRate, 83.2)
    strictEqual(r.buySell2, 'B')
    strictEqual(next.rows.filter(isCompletelyBlankDraft).length, 10)
    strictEqual(next.rows.length, 13)
  })

  it('recalculates amount 2 with the per-100 quote and spot from swap points on forwards', () => {
    let b = fresh()
    const id = firstBlank(b).id
    b = editField(b, id, 'txnType', 'FWD')
    b = editField(b, id, 'curr1', 'USD')
    b = editField(b, id, 'curr2', 'IDR')
    b = editField(b, id, 'totalRate', '1,580')
    b = editField(b, id, 'amt1', '1,000')
    b = editField(b, id, 'swapPoints', '50')
    const r = row(b, id)
    strictEqual(r.amt2, (1000 * 1580) / 100)
    strictEqual(r.spotRate, 1579.5)
  })

  it('turns the NDF fields on for NDF types only', () => {
    let b = fresh()
    const id = firstBlank(b).id
    b = editField(b, id, 'curr1', 'USD')
    b = editField(b, id, 'txnType', 'NDF')
    strictEqual(row(b, id).ndfRef, 'FBIL')
    b = editField(b, id, 'txnType', 'SPOT')
    strictEqual(row(b, id).ndfRef, '')
  })

  it('ignores malformed dates and edits to non-drafts', () => {
    const b = fresh()
    const id = firstBlank(b).id
    strictEqual(editDate(b, id, 'tradeDate', '2026-01-01'), b)
    strictEqual(fmtDate(row(editDate(b, id, 'tradeDate', '02-01-2026'), id).tradeDate), '02-01-2026')
    const createdId = created(b)[0]!.id
    strictEqual(editField(b, createdId, 'entity', 'OTL'), b)
  })
})

describe('filter / sort / overview', () => {
  it('keeps transactions above working drafts above empty rows', () => {
    let b = fresh()
    b = editField(b, firstBlank(b).id, 'entity', 'OTL')
    const sorted = sortRows(settle(b).rows, { key: 'transactionNumber', dir: 1 })
    deepStrictEqual(
      sorted.slice(0, 3).map((r) => r.status),
      ['CREATED', 'CREATED', 'DRAFT'],
    )
    strictEqual(sorted[2]?.entity, 'OTL')
    ok(isCompletelyBlankDraft(sorted[3]))
  })

  it('searches every column and filters by status', () => {
    const b = fresh()
    strictEqual(filterRows(b.rows, b.partners, 'ALL', 'dmcc').length, 1)
    strictEqual(filterRows(b.rows, b.partners, 'CREATED', '').length, 2)
    strictEqual(resultBadge(filterRows(b.rows, b.partners, 'ALL', '')), '2 transactions | 10 empty')
  })

  it('counts statuses and sums notional without the blank rows breaking it', () => {
    let b = fresh()
    const id = b.rows.filter(isCompletelyBlankDraft)[5]!.id
    b = editField(b, id, 'amt1', '100000')
    const k = computeKpis(b.rows)
    strictEqual(k.counts.CREATED, 2)
    strictEqual(k.notional, 5_100_000)
  })
})

describe('row lifecycle', () => {
  it('enables toolbar buttons from the selection', () => {
    const b = fresh()
    const [a, c] = created(b)
    const tb = toolbarState([a!, c!], false)
    ok(tb.release && !tb.create && !tb.ss && !tb.copy)
    ok(toolbarState([firstBlank(b)], false).create)
    ok(!toolbarState([firstBlank(b)], true).create)
  })

  it('validates and creates drafts in the order they were checked', () => {
    let b = fresh()
    const blank = firstBlank(b)
    deepStrictEqual(validateCreate([blank]), [
      'DRAFT-001: Amount 1 must be greater than zero.',
      'DRAFT-001: Total Rate must be greater than zero.',
      'DRAFT-001: Value Date is required.',
    ])
    b = copyRow(b, created(b)[0]!.id)
    const copy = b.rows[0]!
    strictEqual(copy.status, 'DRAFT')
    strictEqual(copy.amt1, 2500000)
    deepStrictEqual(validateCreate([copy]), [])
    b = createDrafts({ ...b, checked: [copy.id] }, [copy.id])
    strictEqual(row(b, copy.id).transactionNumber, '8100003')
    deepStrictEqual(b.checked, [])
  })

  it('deletes drafts only', () => {
    const b = fresh()
    const out = deleteDrafts(b, [firstBlank(b).id, created(b)[0]!.id])
    strictEqual(out.deleted, 1)
    strictEqual(out.blotter.rows.length, 11)
  })
})

describe('release to MO', () => {
  it('pairs the seeded legs to MC-7001 and draws D1 from its balance', () => {
    const b = fresh()
    const [a, c] = created(b)
    ok(pairCheck(a!, c!).ok)
    const cands = mcCandidates(a!, b.contracts)
    // MC-7041 is also USD/INR, but OGA is not in its OGAT-DMCC-OSIPL entity string.
    deepStrictEqual(
      cands.map((m) => m.mcNumber),
      ['MC-7001'],
    )
    ok(toleranceCheck(a!, cands[0]!, true).ok)
    ok(!toleranceCheck(a!, cands[0]!, false).ok)
    const out = assignMc({ ...b, checked: [a!.id, c!.id] }, a!.id, c!.id, 'MC-7001')!
    strictEqual(out.dealId, 'TSF-9080')
    strictEqual(row(out.blotter, a!.id).dealType, 'D1 (Paired Model)')
    strictEqual(row(out.blotter, c!.id).status, 'RELEASED')
    strictEqual(out.blotter.contracts.find((m) => m.mcNumber === 'MC-7001')?.utilizedUSD, 2500000)
    deepStrictEqual(out.blotter.checked, [])
  })

  it('rejects a same-side pair and a value date gap', () => {
    const b = fresh()
    const [a, c] = created(b)
    const check = pairCheck(a!, { ...c!, buySell: 'S', valueDate: new Date(2026, 10, 30) })
    strictEqual(check.ok, false)
    strictEqual(check.msgs.length, 2)
  })

  it('assigns a single leg to an open Deal ID and reverses it back off the MC', () => {
    const b = fresh()
    const [a, c] = created(b)
    let next = assignMc(b, a!.id, c!.id, 'MC-7001')!.blotter
    next = loadContext(next).blotter
    const leg = created(next)[0]!
    const deal = next.deals[0]!
    ok(assignCheck(leg, deal, next.contracts).ok)
    next = assignToDeal(next, leg.id, deal.dealId)
    strictEqual(row(next, leg.id).dealId, 'TSF-9080')
    strictEqual(next.deals[0]?.legs.length, 3)
    strictEqual(next.contracts[0]?.utilizedUSD, 5_000_000)
    next = reverseTxn(next, leg.id)
    strictEqual(row(next, leg.id).status, 'REVERSED')
    strictEqual(next.contracts[0]?.utilizedUSD, 2_500_000)
  })

  it('refuses an assignment beyond the MC balance', () => {
    const b = fresh()
    const leg = { ...created(b)[0]!, amt1: 6_000_000 }
    const deal = {
      dealId: 'TSF-1',
      mcNumber: 'MC-7001',
      model: 'M021',
      type: 'PAIR' as const,
      legs: [],
      createdOn: NOW,
    }
    deepStrictEqual(assignCheck(leg, deal, b.contracts).msgs, [
      "Amount exceeds the Master Contract's remaining balance plus tolerance.",
    ])
  })

  it('releases pre-assigned auto deal legs and short straddle pairs', () => {
    const b = fresh()
    const ids = created(b).map((r) => r.id)
    ok(!isPreassigned(created(b)))
    strictEqual(releaseRows(b, ids).rows.filter((r) => r.status === 'RELEASED').length, 2)
    const ss = confirmShortStraddle(b, ids, true)
    strictEqual(ss.ssDealId, 'SS-500')
    strictEqual(row(ss.blotter, ids[0]!).dealType, 'Short Straddle (No-Invoice)')
    strictEqual(ss.blotter.deals[0]?.type, 'SS')
  })
})

describe('auto deal creation', () => {
  it('offers the origins of contracts with balance and derives both legs from the model', () => {
    const b = fresh()
    deepStrictEqual(autoOrigins(), ['OGA', 'OGAT', 'OAL', 'SEDA'])
    const mc = autoEligible(b.contracts, 'OGA')[0]!
    strictEqual(mc.mcNumber, 'MC-7001')
    const legs = initAutoLegs(mc, NOW)
    strictEqual(legs[0]?.entity, 'OGA')
    strictEqual(legs[1]?.entity, 'DMCC')
    strictEqual(legs[0]?.amt1, 2_000_000)
    strictEqual(legs[0]?.rate, 83.2 * (1 - 28 / 2 / 10000))
    deepStrictEqual(validateAutoLegs(mc, legs), [])
  })

  it('requires equal amounts and books both legs under one Deal ID', () => {
    const b = fresh()
    const mc = b.contracts[0]!
    let legs = initAutoLegs(mc, NOW)
    legs = updateAutoLeg(legs, 1, 'amt1', '1,000,000')
    deepStrictEqual(validateAutoLegs(mc, legs), ['Deal 1 and Deal 2 Amount 1 must be identical.'])
    legs = updateAutoLeg(legs, 0, 'amt1', '1,000,000')
    strictEqual(legs[0]?.amt2, 1_000_000 * legs[0]!.rate)
    const out = confirmAutoDeal(b, mc.mcNumber, legs)!
    strictEqual(out.dealId, 'TSF-9080')
    deepStrictEqual(
      out.blotter.rows.slice(0, 2).map((r) => r.dealType),
      ['Deal 2 (Auto Deal)', 'Deal 1 (Auto Deal)'],
    )
    ok(isPreassigned(out.blotter.rows.slice(0, 2)))
    strictEqual(out.blotter.contracts[0]?.utilizedUSD, 1_000_000)
  })
})

describe('FX Txn List', () => {
  it('lists the Blotter Date rows and puts deal P&L on the D1 leg', () => {
    const b = fresh()
    const [a, c] = created(b)
    const next = assignMc(b, a!.id, c!.id, 'MC-7001')!.blotter
    const crit = { date: '25-09-2026', group: '', trader: '', cpair: 'USD/INR', layout: 'DEFAULT', email: false }
    const rows = runTxnList(next.rows, crit)!
    strictEqual(rows.length, 2)
    const pnl = listPnl(
      rows.find((r) => r.id === a!.id)!,
      rows,
    )
    deepStrictEqual(pnl, { pnl: 2 * 2500000 * 83.2, curr: 'INR' })
    strictEqual(
      listPnl(
        rows.find((r) => r.id === c!.id)!,
        rows,
      ).pnl,
      null,
    )
    strictEqual(runTxnList(next.rows, { ...crit, date: 'soon' }), null)
    strictEqual(runTxnList(next.rows, { ...crit, date: '26-09-2026' })?.length, 0)
  })
})

describe('upload', () => {
  it('parses quoted CSV and TSV and matches header aliases', () => {
    deepStrictEqual(splitDelimitedLine('a,"b, ""c""",d', ','), ['a', 'b, "c"', 'd'])
    const rows = parseDelimitedUpload('Company Code\tT_AMT\tBuy/Sell\r\nSG03\t1,000\tSell\n\n').map(canonicalUploadRow)
    strictEqual(rows.length, 1)
    strictEqual(rows[0]?.companyCode, 'SG03')
    strictEqual(rows[0]?.amt1, '1,000')
    strictEqual(rows[0]?.buySell, 'Sell')
    deepStrictEqual(parseDelimitedUpload('only a header'), [])
  })

  it('maps SAP types and sides', () => {
    strictEqual(mapUploadTxnType('632'), 'NDF')
    strictEqual(mapUploadTxnType('609'), 'SPOT')
    strictEqual(mapUploadTxnType('whatever'), 'FWD')
    strictEqual(mapUploadBuySell('2'), 'S')
    strictEqual(mapUploadBuySell('Buy'), 'B')
  })

  it('validates the sample rows clean and flags broken ones', () => {
    deepStrictEqual(validateUploadRows(sampleUploadRows(NOW)), { errors: [], warnings: [] })
    const bad = { ...sampleUploadRows(NOW)[1]!, curr2: 'usd', ndfRef: '', tradeDate: '26-09-2026' }
    const v = validateUploadRows([bad])
    deepStrictEqual(v.errors, ['Row 1: Curr 1 and Curr 2 cannot be the same.', 'Row 1: NDF Fixing Ref is required.'])
    deepStrictEqual(v.warnings, ['Row 1: Trade Date falls on a non-working day.'])
  })

  it('adds unknown partners and processes rows to the top at the chosen level', () => {
    const b = fresh()
    const bp = uploadBpCode(b.partners, 'New Bank')
    strictEqual(bp.code, `UPL${BUSINESS_PARTNERS.length + 1}`)
    strictEqual(uploadBpCode(b.partners, 'dbs sg').code, 'BP1001')
    const out = processUpload(b, sampleUploadRows(NOW), 'CONTRACT', 'G03', 'TER')!
    strictEqual(out.results.length, 2)
    strictEqual(out.results[0]?.msg, 'Order created and released to MO')
    const top = out.blotter.rows[0]!
    strictEqual(top.txnType, 'NDF')
    strictEqual(top.status, 'RELEASED')
    strictEqual(top.bp, 'BP1002')
    strictEqual(top.ndfRef, 'FBIL')
    strictEqual(top.spotRate, 83.3)
    strictEqual(top.companyCode, 'SG03')
    strictEqual(top.trader, 'TER')
    strictEqual(out.blotter.rows[1]?.swapPoints, 0.05)
    strictEqual(processUpload(b, [{ ...sampleUploadRows(NOW)[0]!, amt1: '0' }], 'ORDER', 'G02', 'NID'), null)
  })
})

describe('hard reset', () => {
  it('restores counters, deals and MC balances but keeps uploaded partners', () => {
    const b = fresh()
    const [a, c] = created(b)
    let next = assignMc(b, a!.id, c!.id, 'MC-7001')!.blotter
    next = { ...changeGroup(next, 'G04'), partners: uploadBpCode(next.partners, 'New Bank').partners, checked: [a!.id] }
    const reset = hardReset(next, NOW)
    deepStrictEqual(
      created(reset).map((r) => r.transactionNumber),
      ['8100001', '8100002'],
    )
    strictEqual(reset.deals.length, 0)
    strictEqual(reset.contracts[0]?.utilizedUSD, 0)
    strictEqual(reset.partners.length, BUSINESS_PARTNERS.length + 1)
    strictEqual(reset.ctx.group, 'G02')
    deepStrictEqual(checkedRows(reset), [])
    strictEqual(sortRows(reset.rows, BY_SEQ)[0]?.transactionNumber, '8100002')
  })
})

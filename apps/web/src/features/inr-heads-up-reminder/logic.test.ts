import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { COLUMNS, LAYOUT_COLUMNS } from './data.ts'
import { fixtureData } from './fixtures.ts'
import { addDaysISO, compactAmount, formatAmount, formatDMY, isoToDMY, parseDMY, trimMillions } from './format.ts'
import {
  DEFAULT_SORT,
  abapUtilisation,
  buildCsv,
  buildMailPlan,
  calendarGrid,
  cellText,
  coAreaOptions,
  columnByKey,
  dealOptions,
  extendModelId,
  filterSortRows,
  getMasterContract,
  initialFilters,
  mailPlanForRow,
  nextSort,
  pageCountOf,
  pruneSelection,
  regionOptions,
  resultCountLabel,
  selectRows,
  sendMailState,
  shiftMonth,
  sortForLayout,
  sortLegs,
  typedDateOnCommit,
  typedDateOnInput,
  viewForText,
  visibleColumns,
  yearRange,
} from './logic.ts'
import type { FxLeg, Leg } from './types.ts'

// Seed rows live in fixtures.ts (test-only); the screen itself has no sample data.
const data = fixtureData()
const rowsFor = (patch: Partial<ReturnType<typeof initialFilters>> = {}) => selectRows(data, { ...initialFilters(), ...patch })
const ids = (patch: Partial<ReturnType<typeof initialFilters>> = {}) => rowsFor(patch).map((r) => r.dealId)
const col = (key: string) => {
  const c = columnByKey(key)
  if (!c) throw new Error(`no column ${key}`)
  return c
}

describe('date and number formatting', () => {
  it('parseDMY takes dd-mm-yyyy, dd/mm/yyyy and dd.mm.yyyy and rejects impossible dates', () => {
    strictEqual(formatDMY(parseDMY('05-10-2026') as Date), '05-10-2026')
    strictEqual(formatDMY(parseDMY('5/1/2026') as Date), '05-01-2026')
    strictEqual(formatDMY(parseDMY('31.12.2026') as Date), '31-12-2026')
    strictEqual(parseDMY('31-02-2026'), null)
    strictEqual(parseDMY('2026-10-05'), null)
    strictEqual(parseDMY(''), null)
  })

  it('isoToDMY, addDaysISO', () => {
    strictEqual(isoToDMY('2026-10-13'), '13-10-2026')
    strictEqual(isoToDMY(''), '')
    strictEqual(addDaysISO('2026-10-13', -2), '2026-10-11')
    strictEqual(addDaysISO('2026-12-31', 1), '2027-01-01')
  })

  it('amount and compact formats', () => {
    strictEqual(formatAmount(1234.5), '1,234.50')
    strictEqual(compactAmount(250000), '250K')
    strictEqual(compactAmount(22500), '22.5K')
    strictEqual(compactAmount(1500000), '1.5M')
    strictEqual(compactAmount(500), '500')
    strictEqual(trimMillions(500000), '0.5')
    strictEqual(trimMillions(33055), '0.033055')
  })
})

describe('model extension and mail plan', () => {
  it('M030 / M034 get a currency suffix, other models do not', () => {
    strictEqual(extendModelId('M034', 'C001'), 'M03401')
    strictEqual(extendModelId('M034', 'C003'), 'M03402')
    strictEqual(extendModelId('M034', 'C002'), 'M034')
    strictEqual(extendModelId('M032', 'C001'), 'M032')
  })

  it('FX1 mails need ZHEAD_FX on the full model id; FX2 mails need ZHEAD_OPT on the first 4 characters', () => {
    deepStrictEqual(mailPlanForRow({ status: '05', modelId: 'M033' }, data.rules, data.indicators), ['Heads Up FX', 'Heads Up FX for DMCC'])
    deepStrictEqual(mailPlanForRow({ status: '05', modelId: 'M032' }, data.rules, data.indicators), []) // no flag on M032
    deepStrictEqual(mailPlanForRow({ status: '05', modelId: 'M03402' }, data.rules, data.indicators), ['Heads Up Option', 'Heads Up Option for DMCC'])
    // FX2 matches the indicator on 4 characters, so M03401 finds M03402's flag, as the ABAP does
    deepStrictEqual(mailPlanForRow({ status: '07', modelId: 'M03401' }, data.rules, data.indicators), ['Heads Up Option', 'Heads Up Option for DMCC'])
    deepStrictEqual(mailPlanForRow({ status: '05', modelId: 'M099' }, data.rules, data.indicators), []) // no RULE_BT row
  })

  it('only status 05 and 07 are mailed', () => {
    deepStrictEqual(mailPlanForRow({ status: '01', modelId: 'M033' }, data.rules, data.indicators), [])
    strictEqual(mailPlanForRow({ status: '07', modelId: 'M033' }, data.rules, data.indicators).length, 2)
  })

  it('buildMailPlan counts eligible deals and mails over the selection', () => {
    const plan = buildMailPlan(rowsFor(), data.rules, data.indicators)
    deepStrictEqual(plan.deals.map((d) => d.dealId), ['7000000008', '7000000011'])
    strictEqual(plan.mailCount, 4)
  })

  it('Send Mail is disabled with the reason, enabled otherwise', () => {
    const plan = buildMailPlan(rowsFor(), data.rules, data.indicators)
    strictEqual(sendMailState(null, plan).disabled, false)
    deepStrictEqual(sendMailState('WAITING FOR DEAL ID API — x', plan), { disabled: true, title: 'WAITING FOR DEAL ID API — x' })
    strictEqual(sendMailState(null, { deals: [], mailCount: 0 }).disabled, true)
  })
})

describe('selectRows (SUB_GET_DATA + DATA_FILTER)', () => {
  it("keeps ZMC_REF <> space only, and LEFT OUTER JOINs a missing MC as blanks", () => {
    deepStrictEqual(ids(), ['7000000006', '7000000007', '7000000008', '7000000011', '7000000021'])
    const orphan = rowsFor({ dealId: '7000000021' })[0]
    strictEqual(orphan?.origin, '')
    strictEqual(orphan?.region, '')
    strictEqual(orphan?.mcAmt, 0)
    strictEqual(orphan?.statusDesc, 'Invoice Created in TRM')
  })

  it('Key Date deletes ze_date <> p_date; status, region, origin and Deal ID are exact', () => {
    deepStrictEqual(ids({ keyDate: '2026-10-05' }), ['7000000007', '7000000008', '7000000021'])
    deepStrictEqual(ids({ status: '05' }), ['7000000007', '7000000011', '7000000021'])
    deepStrictEqual(ids({ region: 'R01' }), ['7000000007'])
    deepStrictEqual(ids({ entity: 'OSIPL' }), ['7000000006', '7000000008', '7000000011'])
    deepStrictEqual(ids({ dealId: '7000000008' }), ['7000000008'])
    deepStrictEqual(ids({ keyDate: '2026-10-05', entity: 'OSIPL' }), ['7000000008'])
  })

  it('status text from DEAL_ST at FX1 even for an FX2 deal (the join is on FX1)', () => {
    strictEqual(rowsFor({ dealId: '7000000011' })[0]?.statusDesc, 'Invoice Created in TRM')
  })

  it('model: the MC model, extended for M030 / M034 by the deal currency; CO model from RULE_BT at P_CO', () => {
    const opt = rowsFor({ dealId: '7000000011' })[0]
    strictEqual(opt?.modelId, 'M03402')
    strictEqual(opt?.modelDesc, 'INR – INR Staggered Call & Put Option')
    strictEqual(opt?.coArea, '')
    const at10 = selectRows(data, { ...initialFilters(), coArea: 'OL10', dealId: '7000000011' })[0]
    strictEqual(at10?.coArea, 'OL10') // looked up on M034, before the extension
    const at20 = selectRows(data, { ...initialFilters(), coArea: 'OL20', dealId: '7000000008' })[0]
    strictEqual(at20?.coModelDesc, 'INR Forward at OL20')
    strictEqual(selectRows(data, { ...initialFilters(), coArea: 'OL20', dealId: '7000000007' })[0]?.coArea, '')
  })

  it('spot flag from ZSGTSFTR_IN_SPOT; legs not served leave utilization null and NDF fields blank', () => {
    const r = rowsFor({ dealId: '7000000008' })[0]
    strictEqual(r?.spot, true)
    strictEqual(rowsFor({ dealId: '7000000007' })[0]?.spot, false)
    strictEqual(r?.utiAmt, null)
    strictEqual(r?.ndfDate, '')
    strictEqual(r?.bank, '')
  })

  it('getMasterContract reads the MC by key with its COMP entity', () => {
    const mc = getMasterContract(data, '2000000015')
    strictEqual(mc?.origin, 'OTL')
    strictEqual(mc?.originName, 'Olam (Thailand) Ltd')
    strictEqual(mc?.region, 'R01')
    strictEqual(mc?.amt, 30087)
    strictEqual(getMasterContract(data, 'nope'), null)
  })

  it('helps: regions are COMP codes without text; CO areas are the ones RULE_BT holds', () => {
    deepStrictEqual(regionOptions(data.entities), [
      { id: 'R01', name: '' },
      { id: 'R02', name: '' },
    ])
    deepStrictEqual(coAreaOptions(data.rules), ['OL10', 'OL20'])
  })
})

describe('utilization (ZSGTSFCDS_FX / _OPTION), as the ABAP computes it', () => {
  const leg = (dealId: string, type: string, curr1: string, amt1: number, curr2: string, amt2: number, mcRef = '2000000005'): Leg => ({
    dealId, type, mcRef, curr1, curr2, amt1, amt2,
  })
  const legs = sortLegs([
    leg('7000000008', 'D1', 'INR', 900000, 'USD', -10000),
    leg('7000000006', 'D1', 'USD', 1000, 'INR', -90000),
    leg('7000000006', 'D2', 'EUR', 5, 'INR', 7),
    leg('7000000007', 'D2', 'USD', -250, 'INR', 1),
  ])

  it('sorts by deal id and deal type', () => {
    deepStrictEqual(legs.map((l) => `${l.dealId}/${l.type}`), ['7000000006/D1', '7000000006/D2', '7000000007/D2', '7000000008/D1'])
  })

  it("runs from the deal's first D1 row to the end of the table (no EXIT on deal change)", () => {
    strictEqual(abapUtilisation(legs, '7000000006'), 1000 + 0 + 250 + 10000)
    strictEqual(abapUtilisation(legs, '7000000008'), 10000)
    strictEqual(abapUtilisation(legs, '7000000007'), 0) // no D1 row: nothing
  })

  it('with both views served, the row sums FX + option and fills Fixing Day / Bank from the 12D leg', () => {
    const fx: FxLeg[] = [{ ...leg('7000000006', 'D1', 'USD', 1000, 'INR', -90000), sgsart: '12D', bp: 'HSBC', ndfDate: '2026-10-28' }]
    const op: Leg[] = [leg('7000000006', 'D1', 'INR', 1, 'USD', -500)]
    const r = selectRows({ ...data, fxLegs: fx, optLegs: op }, { ...initialFilters(), dealId: '7000000006' })[0]
    strictEqual(r?.utiAmt, 1500)
    strictEqual(r?.ndfDate, '2026-10-28')
    strictEqual(r?.bank, 'HSBC')
    // FOR ALL ENTRIES: legs of MCs outside the selection are not read
    const other = selectRows({ ...data, fxLegs: fx, optLegs: op }, { ...initialFilters(), dealId: '7000000008' })[0]
    strictEqual(other?.utiAmt, 0)
  })
})

describe('columns, search and sort', () => {
  const rows = rowsFor()

  it('layouts pick their columns; unknown layouts fall back to the default', () => {
    strictEqual(visibleColumns('').length, LAYOUT_COLUMNS['']?.length)
    strictEqual(visibleColumns('HEADSUP').length, 12)
    strictEqual(visibleColumns('ALLCOLS').length, COLUMNS.length)
    strictEqual(visibleColumns('???').length, visibleColumns('').length)
  })

  it('cell text formats dates, amounts, rates and flags; a missing amount is blank', () => {
    const r = rowsFor({ dealId: '7000000007' })[0]
    if (!r) throw new Error('no row')
    strictEqual(cellText(col('maturityDate'), r), '05-10-2026')
    strictEqual(cellText(col('mcAmt'), r), '30,087.00')
    strictEqual(cellText(col('plRate'), r), '90.4000')
    strictEqual(cellText(col('plAmt'), r), '125.00')
    strictEqual(cellText(col('confirmed'), r), 'X')
    strictEqual(cellText(col('spot'), r), '')
    strictEqual(cellText(col('utiAmt'), r), '')
    strictEqual(cellText(col('changedDate'), r), '')
  })

  it('default sort is Deal ID ascending', () => {
    const list = filterSortRows(rows, '', '', DEFAULT_SORT)
    strictEqual(list[0]?.dealId, '7000000006')
    strictEqual(list.at(-1)?.dealId, '7000000021')
  })

  it('sorts numbers numerically, text case-insensitively, ties by deal id', () => {
    const byAmt = filterSortRows(rows, '', '', { field: 'mcAmt', dir: 'desc' })
    deepStrictEqual(byAmt.map((r) => r.dealId), ['7000000011', '7000000006', '7000000008', '7000000007', '7000000021'])
    const byOrigin = filterSortRows(rows, '', '', { field: 'origin', dir: 'asc' })
    strictEqual(byOrigin[0]?.origin, '')
    strictEqual(byOrigin.at(-1)?.origin, 'OTL')
  })

  it('nextSort flips the same column and restarts ascending on another', () => {
    deepStrictEqual(nextSort({ field: 'dealId', dir: 'asc' }, 'dealId'), { field: 'dealId', dir: 'desc' })
    deepStrictEqual(nextSort({ field: 'dealId', dir: 'desc' }, 'origin'), { field: 'origin', dir: 'asc' })
  })

  it('a sort on a column the new layout lacks falls back to Deal ID', () => {
    deepStrictEqual(sortForLayout({ field: 'region', dir: 'desc' }, 'HEADSUP'), DEFAULT_SORT)
    deepStrictEqual(sortForLayout({ field: 'origin', dir: 'desc' }, 'HEADSUP'), { field: 'origin', dir: 'desc' })
  })

  it('search matches the visible cell text only', () => {
    strictEqual(filterSortRows(rows, '', '  7000000008 ', DEFAULT_SORT).length, 1)
    strictEqual(filterSortRows(rows, '', '05-10-2026', DEFAULT_SORT).length, 3)
    // "Changed By" is not in the default layout but is in ALLCOLS
    strictEqual(filterSortRows(rows, '', 'rmenon', DEFAULT_SORT).length, 0)
    strictEqual(filterSortRows(rows, 'ALLCOLS', 'rmenon', DEFAULT_SORT).length, 1)
  })

  it('pruneSelection keeps the selection only while the row is listed', () => {
    strictEqual(pruneSelection('7000000006', rows), '7000000006')
    strictEqual(pruneSelection('zzz', rows), null)
    strictEqual(pruneSelection(null, rows), null)
  })

  it('dealOptions searches "<id> <description>" case-insensitively over every Deal ID', () => {
    strictEqual(dealOptions(data.deals, '').length, 6)
    strictEqual(dealOptions(data.deals, '7000000006').length, 1)
    strictEqual(dealOptions(data.deals, 'say "HI"').length, 1)
    strictEqual(dealOptions(data.deals, 'zzz').length, 0)
  })
})

describe('pagination', () => {
  it('page count is at least 1', () => {
    strictEqual(pageCountOf(0, 20), 1)
    strictEqual(pageCountOf(30, 20), 2)
    strictEqual(pageCountOf(40, 20), 2)
  })

  it('result count label', () => {
    strictEqual(resultCountLabel(0, 1, 20), '0 deals')
    strictEqual(resultCountLabel(1, 1, 20), '1–1 of 1 deal')
    strictEqual(resultCountLabel(30, 2, 20), '21–30 of 30 deals')
    strictEqual(resultCountLabel(30, 1, 8), '1–8 of 30 deals')
  })
})

describe('CSV export', () => {
  it('starts with a BOM, quotes every cell, doubles quotes and uses CRLF', () => {
    const rows = rowsFor({ dealId: '7000000011' })
    const csv = buildCsv(visibleColumns('HEADSUP'), rows)
    strictEqual(csv.charCodeAt(0), 0xfeff)
    const lines = csv.slice(1).split('\r\n')
    strictEqual(lines.length, 2)
    strictEqual(lines[0], '"Deal ID","Sub Type","Deal Description","Deal Maturity Date","MC Reference","Deal Status","Status Description","Origin Entity","FX Model","FX Utilisation Amount","Fixing Day","Bank name"')
    strictEqual(lines[1], '"7000000011","FX2","Say ""hi"" option","02-11-2026","2000000008","05","Invoice Created in TRM","OSIPL","M03402","","",""')
  })

  it('an empty list exports the header only', () => {
    strictEqual(buildCsv([col('dealId')], []), '﻿"Deal ID"')
  })
})

describe('Key Date box', () => {
  it('typing applies only a complete valid date, or empty', () => {
    deepStrictEqual(typedDateOnInput(''), { kind: 'clear' })
    deepStrictEqual(typedDateOnInput('  '), { kind: 'clear' })
    deepStrictEqual(typedDateOnInput('13-10-20'), { kind: 'none' })
    deepStrictEqual(typedDateOnInput('3-10-2026'), { kind: 'none' }) // valid, but not 10 characters yet
    deepStrictEqual(typedDateOnInput('13-10-2026'), {
      kind: 'commit',
      iso: '2026-10-13',
      text: '13-10-2026',
      view: { year: 2026, month: 9 },
    })
    deepStrictEqual(typedDateOnInput('31-02-2026'), { kind: 'none' })
  })

  it('blur / Enter reformats a valid date and flags anything else', () => {
    deepStrictEqual(typedDateOnCommit(''), { kind: 'clear' })
    deepStrictEqual(typedDateOnCommit('3/10/2026'), {
      kind: 'commit',
      iso: '2026-10-03',
      text: '03-10-2026',
      view: { year: 2026, month: 9 },
    })
    deepStrictEqual(typedDateOnCommit('abc'), { kind: 'error' })
    deepStrictEqual(typedDateOnCommit('31-02-2026'), { kind: 'error' })
  })
})

describe('calendar', () => {
  it('lays out leading, month and trailing days', () => {
    // October 2026 starts on a Thursday (4 leading days) and has 31 days (0 trailing: 4+31=35)
    const oct = calendarGrid(2026, 9)
    deepStrictEqual(oct.leading, [27, 28, 29, 30])
    strictEqual(oct.daysInMonth, 31)
    deepStrictEqual(oct.trailing, [])
    // November 2026 starts on a Sunday and ends on a Monday: 5 trailing days
    const nov = calendarGrid(2026, 10)
    deepStrictEqual(nov.leading, [])
    deepStrictEqual(nov.trailing, [1, 2, 3, 4, 5])
  })

  it('month navigation wraps the year; the year list always holds the year on show', () => {
    deepStrictEqual(shiftMonth({ year: 2026, month: 11 }, 1), { year: 2027, month: 0 })
    deepStrictEqual(shiftMonth({ year: 2026, month: 0 }, -1), { year: 2025, month: 11 })
    strictEqual(yearRange(2026)[0], 2020)
    strictEqual(yearRange(2026).at(-1), 2035)
    strictEqual(yearRange(2010)[0], 2010)
    strictEqual(yearRange(2040).at(-1), 2040)
  })

  it('opens on the typed date\'s month, else the current month', () => {
    deepStrictEqual(viewForText('13-03-2027'), { year: 2027, month: 2 })
    deepStrictEqual(viewForText('garbage', new Date(2026, 4, 9)), { year: 2026, month: 4 })
  })
})

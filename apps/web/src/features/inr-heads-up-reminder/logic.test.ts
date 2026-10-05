import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { COLUMNS, DEAL_SEEDS, LAYOUT_COLUMNS, MC_SEED } from './data.ts'
import { addDaysISO, compactAmount, formatAmount, formatDMY, isoToDMY, parseDMY, trimMillions } from './format.ts'
import {
  DEFAULT_SORT,
  buildCsv,
  buildMailPlan,
  buildMockTables,
  calculateUtilisation,
  calendarGrid,
  cellText,
  columnByKey,
  dealOptions,
  extendModelId,
  fetchDeals,
  filterSortRows,
  getMasterContract,
  initialFilters,
  mailPlanForRow,
  nextSort,
  pageCountOf,
  pruneSelection,
  resultCountLabel,
  sendHeadsUpMails,
  sendMailState,
  shiftMonth,
  sortForLayout,
  typedDateOnCommit,
  typedDateOnInput,
  viewForText,
  visibleColumns,
  yearRange,
} from './logic.ts'

const tables = buildMockTables()
const rowsFor = (patch: Partial<ReturnType<typeof initialFilters>> = {}) => fetchDeals(tables, { ...initialFilters(), ...patch })
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

  it('FX1 models mail only with the FX indicator, FX2 only with the option indicator', () => {
    deepStrictEqual(mailPlanForRow({ status: '05', modelId: 'M032' }), ['Heads Up FX', 'Heads Up FX for DMCC'])
    deepStrictEqual(mailPlanForRow({ status: '07', modelId: 'M03401' }), ['Heads Up Option', 'Heads Up Option for DMCC'])
    deepStrictEqual(mailPlanForRow({ status: '05', modelId: 'M041' }), [])
  })

  it('only status 05 and 07 are mailed', () => {
    deepStrictEqual(mailPlanForRow({ status: '03', modelId: 'M032' }), [])
    deepStrictEqual(mailPlanForRow({ status: '08', modelId: 'M032' }), [])
    deepStrictEqual(mailPlanForRow({ status: '05', modelId: 'M999' }), [])
  })

  it('buildMailPlan counts eligible deals and mails', () => {
    const plan = buildMailPlan([
      { dealId: '1', status: '05', modelId: 'M032' },
      { dealId: '2', status: '05', modelId: 'M041' },
      { dealId: '3', status: '07', modelId: 'M03402' },
      { dealId: '4', status: '02', modelId: 'M032' },
    ])
    deepStrictEqual(
      plan.deals.map((d) => d.dealId),
      ['1', '3'],
    )
    strictEqual(plan.mailCount, 4)
  })

  it('Send Mail is disabled with the reason, enabled otherwise', () => {
    const plan = buildMailPlan([{ dealId: '1', status: '05', modelId: 'M032' }])
    strictEqual(sendMailState(null, plan).disabled, false)
    strictEqual(sendMailState('x', plan).title, 'Not available without CO Area authorization')
    strictEqual(sendMailState(null, { deals: [], mailCount: 0 }).title, 'No deal with status 05 / 07 and a heads-up indicator in the selection')
  })

  it('sendHeadsUpMails returns the success text only when there is a mail', () => {
    deepStrictEqual(sendHeadsUpMails([]).texts, [])
    const rows = rowsFor().rows
    deepStrictEqual(sendHeadsUpMails(rows).texts, ['Successfully Sent'])
  })
})

describe('mock tables', () => {
  it('builds every seeded deal with ids from 1000004101', () => {
    strictEqual(tables.deals.length, DEAL_SEEDS.length)
    strictEqual(tables.deals[0]?.dealId, '1000004101')
    strictEqual(tables.deals[29]?.dealId, '1000004130')
    strictEqual(tables.masterContracts.length, MC_SEED.length)
    strictEqual(tables.masterContracts[0]?.ref, 'MC/OSIPL/2026/728')
  })

  it('is deterministic', () => {
    deepStrictEqual(buildMockTables(), tables)
  })

  it('settled-stage statuses carry a P&L and spot flag, the others do not', () => {
    const settled = tables.deals.find((d) => d.status === '08')
    strictEqual(settled?.plCurr, 'USD')
    strictEqual(tables.spotDealIds[settled?.dealId ?? ''], true)
    const open = tables.deals.find((d) => d.status === '05')
    strictEqual(open?.plAmt, 0)
    strictEqual(open?.plCurr, '')
    strictEqual(tables.spotDealIds[open?.dealId ?? ''], undefined)
  })

  it('FX1 deals get one USD leg, FX2 deals get two option legs', () => {
    strictEqual(tables.fxLegs.length + tables.optLegs.length / 2, tables.deals.length)
    const first = tables.fxLegs[0]
    strictEqual(first?.curr1, 'USD')
    strictEqual(first?.curr2, 'INR')
    strictEqual(first?.amt2, -9000000)
  })

  it('NDF legs (M032 / M037) carry bank and fixing day two days before maturity', () => {
    const ndf = tables.fxLegs.find((l) => l.sgsart === '12D')
    strictEqual(ndf?.bp, 'HSBC')
    strictEqual(ndf?.ndfDate, '2026-10-11')
    const other = tables.fxLegs.find((l) => l.sgsart === '11D')
    strictEqual(other?.bp, '')
    strictEqual(other?.ndfDate, '')
  })

  it('utilisation is the absolute USD side of the deal legs', () => {
    strictEqual(calculateUtilisation(tables, '1000004101'), 100000)
    // option deal 727 / 250000: legs hold 125000 USD each side
    strictEqual(calculateUtilisation(tables, '1000004102'), 250000)
    strictEqual(calculateUtilisation(tables, 'nope'), 0)
  })
})

describe('fetchDeals (SUB_GET_DATA + DATA_FILTER)', () => {
  it('lists every deal for the default CO area', () => {
    const r = rowsFor()
    strictEqual(r.error, null)
    strictEqual(r.rows.length, 30)
  })

  it('an unauthorized CO area gives the error and no rows', () => {
    const r = rowsFor({ coArea: 'OL09' })
    strictEqual(r.error, 'You are not authorized to execute for the CO Area OL09')
    strictEqual(r.rows.length, 0)
  })

  it('no CO area is not checked and leaves the CO columns blank', () => {
    const r = rowsFor({ coArea: '' })
    strictEqual(r.error, null)
    strictEqual(r.rows.every((x) => x.coArea === ''), true)
  })

  it('filters on key date (maturity), status, region, entity and deal id', () => {
    strictEqual(rowsFor({ keyDate: '2026-10-13' }).rows.every((r) => r.maturityDate === '2026-10-13'), true)
    strictEqual(rowsFor({ keyDate: '2026-10-13' }).rows.length, 5)
    strictEqual(rowsFor({ status: '08' }).rows.length, 2)
    strictEqual(rowsFor({ region: 'SEA' }).rows.every((r) => r.region === 'SEA'), true)
    strictEqual(rowsFor({ entity: 'OVL' }).rows.every((r) => r.origin === 'OVL'), true)
    deepStrictEqual(
      rowsFor({ dealId: '1000004105' }).rows.map((r) => r.dealId),
      ['1000004105'],
    )
    strictEqual(rowsFor({ keyDate: '2030-01-01' }).rows.length, 0)
  })

  it('a row carries the extended model id and CO model description', () => {
    const row = rowsFor({ dealId: '1000004105' }).rows[0]
    strictEqual(row?.modelId, 'M03401') // MC 725 / M034 / C001
    strictEqual(row?.modelDesc, 'INR - INR Staggered Call & Put Option')
    strictEqual(row?.coArea, 'OL01')
    strictEqual(row?.mcDesc, 'OTL_SOYOIL_M034_0.022889M')
    strictEqual(row?.statusDesc, 'Confirmed')
  })

  it('CO area OL02 only resolves the models that exist for it', () => {
    const row = rowsFor({ coArea: 'OL02', dealId: '1000004101' }).rows[0] // M032 is an OL01 model
    strictEqual(row?.coArea, '')
    strictEqual(row?.coModelDesc, '')
  })

  it('getMasterContract resolves a reference, null otherwise', () => {
    const mc = getMasterContract(tables, 'MC/OTL/2026/707')
    strictEqual(mc?.originName, 'Olam (Thailand) Ltd')
    strictEqual(mc?.region, 'SEA')
    strictEqual(mc?.modelDesc, 'USD-INR-INR-Put & Call Option')
    strictEqual(getMasterContract(tables, 'MC/X/1'), null)
  })
})

describe('columns, search and sort', () => {
  const rows = rowsFor().rows

  it('layouts pick their columns; unknown layouts fall back to the default', () => {
    strictEqual(visibleColumns('').length, LAYOUT_COLUMNS['']?.length)
    strictEqual(visibleColumns('HEADSUP').length, 12)
    strictEqual(visibleColumns('ALLCOLS').length, COLUMNS.length)
    strictEqual(visibleColumns('???').length, visibleColumns('').length)
  })

  it('cell text formats dates, amounts, rates and flags', () => {
    const r = rowsFor({ dealId: '1000004129' }).rows[0]
    if (!r) throw new Error('no row')
    strictEqual(cellText(col('maturityDate'), r), '05-10-2026')
    strictEqual(cellText(col('mcAmt'), r), '30,087.00')
    strictEqual(cellText(col('plRate'), r), '90.400000')
    strictEqual(cellText(col('plAmt'), r), '125.00')
    strictEqual(cellText(col('confirmed'), r), 'X')
    strictEqual(cellText(col('spot'), r), 'X')
    const open = rowsFor({ dealId: '1000004101' }).rows[0]
    if (!open) throw new Error('no row')
    strictEqual(cellText(col('spot'), open), '')
    strictEqual(cellText(col('plAmt'), open), '0.00')
    strictEqual(cellText(col('plCurr'), open), '')
  })

  it('default sort is Deal ID ascending', () => {
    const list = filterSortRows(rows, '', '', DEFAULT_SORT)
    strictEqual(list[0]?.dealId, '1000004101')
    strictEqual(list[29]?.dealId, '1000004130')
  })

  it('sorts numbers numerically, text case-insensitively, ties by deal id', () => {
    const byAmt = filterSortRows(rows, '', '', { field: 'utiAmt', dir: 'desc' })
    strictEqual(byAmt[0]?.utiAmt, 250000)
    strictEqual(byAmt[0]?.dealId, '1000004102')
    strictEqual(byAmt[1]?.dealId, '1000004103')
    const byOrigin = filterSortRows(rows, '', '', { field: 'origin', dir: 'asc' })
    strictEqual(byOrigin[0]?.origin, 'OSIPL')
    strictEqual(byOrigin[byOrigin.length - 1]?.origin, 'OVL')
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
    strictEqual(filterSortRows(rows, '', 'palmolein', DEFAULT_SORT).length, 0) // not in the description columns...
    strictEqual(filterSortRows(rows, '', '  1000004105 ', DEFAULT_SORT).length, 1)
    strictEqual(filterSortRows(rows, '', '13-10-2026', DEFAULT_SORT).length, 5)
    // "Created By" is not in the default layout but is in ALLCOLS
    strictEqual(filterSortRows(rows, '', 'skapoor', DEFAULT_SORT).length, 0)
    strictEqual(filterSortRows(rows, 'ALLCOLS', 'skapoor', DEFAULT_SORT).length > 0, true)
  })

  it('pruneSelection keeps the selection only while the row is listed', () => {
    strictEqual(pruneSelection('1000004101', rows), '1000004101')
    strictEqual(pruneSelection('zzz', rows), null)
    strictEqual(pruneSelection(null, rows), null)
  })

  it('dealOptions searches "<id> <description>" case-insensitively', () => {
    strictEqual(dealOptions(tables.deals, '').length, 30)
    strictEqual(dealOptions(tables.deals, '1000004101').length, 1)
    strictEqual(dealOptions(tables.deals, 'otl inr - inr').length > 0, true)
    strictEqual(dealOptions(tables.deals, 'zzz').length, 0)
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
    const rows = rowsFor({ dealId: '1000004101' }).rows
    const csv = buildCsv(visibleColumns('HEADSUP'), rows)
    strictEqual(csv.charCodeAt(0), 0xfeff)
    const lines = csv.slice(1).split('\r\n')
    strictEqual(lines.length, 2)
    strictEqual(lines[0], '"Deal ID","Sub Type","Deal Description","Deal Maturity Date","MC Reference","Deal Status","Status Description","Origin Entity","FX Model","FX Utilisation Amount","Fixing Day","Bank name"')
    strictEqual(lines[1]?.startsWith('"1000004101","FX1","OSIPL INR Long Forward USD 100K","13-10-2026"'), true)
    strictEqual(buildCsv([col('dealDesc')], [{ ...(rows[0] as (typeof rows)[number]), dealDesc: 'say "hi"' }]), '﻿"Deal Description"\r\n"say ""hi"""')
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

import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildFreshDataset } from './data.ts'
import { compactMillions, formatDMY, parseDMY } from './format.ts'
import {
  applyCorrection,
  calcOrigin,
  canAct,
  cellText,
  correctionBlockedMessage,
  currentYearRange,
  defaultFilters,
  filterSortRows,
  formFromRow,
  isAmendedDateValid,
  oneMonthBefore,
  picksFromRow,
  reverseRow,
  validateCorrection,
} from './logic.ts'
import type { CorrectionForm, ErrorRow, Filters } from './types.ts'

const TODAY = new Date(2026, 8, 25)
const ALL_2026: Filters = defaultFilters(TODAY)
const BY_REF_DESC = { field: 'mcRef', dir: 'desc' } as const

const firstRow = (): ErrorRow => buildFreshDataset()[0]!

const filled = (overrides: Partial<CorrectionForm> = {}): CorrectionForm => ({
  ...formFromRow(firstRow(), TODAY),
  foRemarks: 'Amount corrected',
  ...overrides,
})

describe('seed rows', () => {
  it('derive model, entity, currency and description fields', () => {
    const row = firstRow()
    strictEqual(row.mcRef, 2000000348)
    strictEqual(row.fxCode, 'M035')
    strictEqual(row.entityId, 'E026')
    strictEqual(row.currencyI, 'C003')
    strictEqual(row.mcDescription, 'OSIPL_Multi-Commodity_M035_0.003459M')
    strictEqual(row.mcAmountOrigin, 13836)
    strictEqual(row.commodityText, 'C001 Multiple Commodity')
    strictEqual(row.status, 'correction')
  })

  it('compacts amounts to millions like the MC description tag', () => {
    strictEqual(compactMillions(46215), '0.046215M')
    strictEqual(compactMillions(2_000_000), '2.0M')
  })
})

describe('filterSortRows', () => {
  const rows = buildFreshDataset()

  it('defaults to the current calendar year', () => {
    deepStrictEqual(currentYearRange(TODAY), { dateFrom: '01-01-2026', dateTo: '31-12-2026' })
    strictEqual(filterSortRows(rows, '', ALL_2026, BY_REF_DESC).length, 13)
    strictEqual(filterSortRows(rows, '', defaultFilters(new Date(2025, 0, 1)), BY_REF_DESC).length, 0)
  })

  it('sorts by MC reference descending by default', () => {
    strictEqual(filterSortRows(rows, '', ALL_2026, BY_REF_DESC)[0]?.mcRef, 2000000994)
  })

  it('sorts DD-MM-YYYY dates chronologically, not as text', () => {
    const list = filterSortRows(rows, '', ALL_2026, { field: 'mcDate', dir: 'desc' })
    strictEqual(list[0]?.mcDate, '26-11-2026')
  })

  it('filters by MC Date range, region and origin', () => {
    const oct = filterSortRows(rows, '', { ...ALL_2026, dateFrom: '01-10-2026', dateTo: '31-10-2026' }, BY_REF_DESC)
    deepStrictEqual(oct.map((r) => r.mcRef), [2000000831, 2000000830, 2000000829, 2000000828, 2000000827])
    const r04 = filterSortRows(rows, '', { ...ALL_2026, region: 'R04' }, BY_REF_DESC)
    deepStrictEqual(r04.map((r) => r.mcRef), [2000000395, 2000000372])
    strictEqual(filterSortRows(rows, '', { ...ALL_2026, origin: 'OTL' }, BY_REF_DESC).length, 0)
  })

  it('matches the FX model filter on model id, so M034 (M034a) leaves out the M034b rows', () => {
    const list = filterSortRows(rows, '', { ...ALL_2026, fxModel: 'M034a' }, BY_REF_DESC)
    deepStrictEqual(list.map((r) => r.mcRef), [2000000828, 2000000371])
  })

  it('searches every visible column, including derived text', () => {
    deepStrictEqual(filterSortRows(rows, 'soyabean', ALL_2026, BY_REF_DESC).map((r) => r.mcRef), [2000000372])
    deepStrictEqual(filterSortRows(rows, 'latin america', ALL_2026, BY_REF_DESC).map((r) => r.mcRef), [2000000830])
    deepStrictEqual(filterSortRows(rows, 'any port(s) in indonesia', ALL_2026, BY_REF_DESC).map((r) => r.mcRef), [2000000829])
    strictEqual(filterSortRows(rows, 'error correction', ALL_2026, BY_REF_DESC).length, 13)
  })

  it('shows status labels and a dash for missing FO remarks', () => {
    const row = firstRow()
    strictEqual(cellText(row, 'status'), 'Error Correction')
    strictEqual(cellText(reverseRow(row), 'status'), 'Reversed')
    strictEqual(cellText(row, 'foRemarks'), '—')
    strictEqual(cellText(row, 'regionId'), 'R01 - South-East Asia')
    strictEqual(cellText(row, 'commodityText'), '')
  })
})

describe('amended date cutoff', () => {
  it('goes back one calendar month, clamped to the month end', () => {
    strictEqual(formatDMY(oneMonthBefore(new Date(2026, 2, 31))), '28-02-2026')
    strictEqual(formatDMY(oneMonthBefore(new Date(2026, 0, 15))), '15-12-2025')
  })

  it('rejects dates older than one month, allows any future date', () => {
    strictEqual(isAmendedDateValid('25-08-2026', undefined, TODAY), true)
    strictEqual(isAmendedDateValid('24-08-2026', undefined, TODAY), false)
    strictEqual(isAmendedDateValid('31-12-2030', undefined, TODAY), true)
    strictEqual(isAmendedDateValid('31-02-2026', undefined, TODAY), false)
  })

  it('lifts the cutoff for ABAP status 21', () => {
    strictEqual(isAmendedDateValid('01-01-2020', '21', TODAY), true)
    strictEqual(isAmendedDateValid('01-01-2020', '11', TODAY), false)
  })
})

describe('validateCorrection', () => {
  it('opens a row with today as amended date and the row values', () => {
    const form = formFromRow(firstRow(), TODAY)
    strictEqual(form.amendedDate, '25-09-2026')
    strictEqual(form.amountUsd, '3,459.00')
    strictEqual(form.exRate, '4.000000')
    strictEqual(form.amountOrigin, '13,836.00 INR')
  })

  it('accepts a complete form', () => {
    deepStrictEqual(validateCorrection(filled(), undefined, TODAY), { valid: true, errors: {} })
  })

  it('needs FO remarks', () => {
    deepStrictEqual(validateCorrection(filled({ foRemarks: '   ' }), undefined, TODAY).errors, { foRemarks: true })
  })

  it('needs a positive amount and rate', () => {
    deepStrictEqual(validateCorrection(filled({ amountUsd: '0', exRate: 'x' }), undefined, TODAY).errors, {
      amountUsd: true,
      exRate: true,
    })
  })

  it('needs a shipment window whose end is not before its start', () => {
    deepStrictEqual(validateCorrection(filled({ shipEnd: '26-09-2026' }), undefined, TODAY).errors, { shipEnd: true })
    deepStrictEqual(validateCorrection(filled({ shipStart: '', shipEnd: '' }), undefined, TODAY).errors, {
      shipStart: true,
      shipEnd: true,
    })
  })

  it('recalculates the origin amount only for positive inputs', () => {
    strictEqual(calcOrigin('1,000', '2.5'), '2,500.00')
    strictEqual(calcOrigin('1,000', '0'), '')
  })
})

describe('transitions', () => {
  it('Update & Resubmit writes the corrections back and releases to MO', () => {
    const row = firstRow()
    const form = filled({ amountUsd: '5,000.00', exRate: '3', paymentTerms: '', portShipment: 'PG10' })
    const updated = applyCorrection(row, form, { ...picksFromRow(row), paymentTerms: 'P04', portShipment: 'PG10' })
    strictEqual(updated.status, 'resubmitted')
    strictEqual(updated.mcAmt, 5000)
    strictEqual(updated.mcBalAmt, 5000)
    strictEqual(updated.mcAmountOrigin, 15000)
    strictEqual(updated.paymentTermsCode, 'P04')
    strictEqual(updated.ownExplanation, '360 days from bill of lading date')
    strictEqual(updated.shipRegionCode, 'PG10')
    strictEqual(updated.destRegionCode, row.destRegionCode)
    strictEqual(updated.foRemarks, 'Amount corrected')
    strictEqual(updated.mcAmendedDate, '25-09-2026')
    strictEqual(row.status, 'correction')
  })

  it('only rows awaiting correction can be corrected or reversed', () => {
    const row = firstRow()
    strictEqual(canAct(row), true)
    strictEqual(canAct(undefined), false)
    strictEqual(canAct(reverseRow(row)), false)
    strictEqual(correctionBlockedMessage(row), null)
    strictEqual(correctionBlockedMessage(reverseRow(row)), 'This Master Contract has already been reversed.')
    strictEqual(
      correctionBlockedMessage(applyCorrection(row, filled(), picksFromRow(row))),
      'This Master Contract has already been resubmitted.',
    )
  })

  it('parses only real DD-MM-YYYY dates', () => {
    strictEqual(parseDMY('31-02-2026'), null)
    strictEqual(parseDMY('2026-02-01'), null)
  })
})

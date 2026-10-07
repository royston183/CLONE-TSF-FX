import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  TF_FIELD_MAP,
  buildRowPayload,
  datsToIso,
  isCreateRow,
  lookupCommodity,
  padKey,
  buildBlPayload,
  createKey,
  toIsoDate,
} from './fields.ts'
import { displayCell } from './display.ts'
import type { CellValue } from './xlsx.ts'

const BUSINESS_UNITS = [
  { code: 'B01', name: 'GRAINS' },
  { code: 'B02', name: 'RICE' },
]

const COMMODITIES = [
  { ZcommId: 'C1', ZcommDesc: 'Long Grain Rice', ZchName1: 'RICE-LG', ZchName2: 'RICELG' },
  { ZcommId: 'C2', ZcommDesc: 'Wheat', ZchName1: 'WHEAT', ZchName2: 'WHT' },
]

/** A row of the right width with values placed at the given column indexes. */
function row(values: Record<number, CellValue>): CellValue[] {
  const out: CellValue[] = new Array<CellValue>(TF_FIELD_MAP.length).fill('')
  for (const [index, value] of Object.entries(values)) out[Number(index)] = value
  return out
}

describe('toIsoDate', () => {
  it('converts an Excel serial using the 1899-12-30 epoch', () => {
    // 45000 is 2023-03-15 in Excel's serial calendar.
    strictEqual(toIsoDate(45000), '2023-03-15')
  })

  it('absorbs Excel’s phantom 1900 leap day', () => {
    // Serial 60 is Excel's non-existent 1900-02-29; 61 must be 1900-03-01.
    strictEqual(toIsoDate(61), '1900-03-01')
  })

  it('takes the date part of ISO text', () => {
    strictEqual(toIsoDate('2026-04-15'), '2026-04-15')
    strictEqual(toIsoDate('2026-04-15T10:00:00Z'), '2026-04-15')
  })

  it('is null for anything unusable, so the field is skipped rather than cleared', () => {
    strictEqual(toIsoDate(''), null)
    strictEqual(toIsoDate(null), null)
    strictEqual(toIsoDate(undefined), null)
    strictEqual(toIsoDate('15-04-2026'), null)
    strictEqual(toIsoDate('not a date'), null)
  })
})

describe('padKey', () => {
  it('zero-pads a purely numeric key to the stored width', () => {
    strictEqual(padKey('22', 10), '0000000022')
    strictEqual(padKey(1, 2), '01')
  })

  it('leaves an already-padded value alone', () => {
    strictEqual(padKey('0000000022', 10), '0000000022')
  })

  it('passes a non-numeric value through untouched', () => {
    strictEqual(padKey('TF-22', 10), 'TF-22')
  })

  it('is "" for blank input', () => {
    strictEqual(padKey('', 2), '')
    strictEqual(padKey(null, 2), '')
  })
})

describe('isCreateRow', () => {
  it('treats a blank Trade Flow ID as a create', () => {
    strictEqual(isCreateRow(row({})), true)
    strictEqual(isCreateRow(row({ 0: '   ' })), true)
  })

  it('treats any Trade Flow ID as an update', () => {
    strictEqual(isCreateRow(row({ 0: '0000000022' })), false)
    strictEqual(isCreateRow(row({ 0: 22 })), false)
  })
})

describe('lookupCommodity', () => {
  it('matches on either commodity name', () => {
    strictEqual(lookupCommodity('RICE-LG', COMMODITIES)?.ZcommId, 'C1')
    strictEqual(lookupCommodity('WHT', COMMODITIES)?.ZcommId, 'C2')
  })

  it('prefers the first name when both could match', () => {
    const rows = [
      { ZcommId: 'A', ZchName1: 'X', ZchName2: 'Y' },
      { ZcommId: 'B', ZchName1: 'Z', ZchName2: 'X' },
    ]
    strictEqual(lookupCommodity('X', rows)?.ZcommId, 'A')
  })

  it('is undefined for no match or no value', () => {
    strictEqual(lookupCommodity('NOPE', COMMODITIES), undefined)
    strictEqual(lookupCommodity('', COMMODITIES), undefined)
  })
})

describe('buildRowPayload', () => {
  it('never includes the key columns — they address the entity, not the body', () => {
    const body = buildRowPayload(row({ 0: '22', 1: '01', 3: 'RICE' }), 'B02', '01', false, BUSINESS_UNITS, [])
    strictEqual('ZtfNo' in body, false)
    strictEqual('ZtfSplit' in body, false)
  })

  it('omits empty cells, so an update never clears a field on the SAP side', () => {
    const body = buildRowPayload(row({ 4: 'OPS' }), '', '', false, BUSINESS_UNITS, [])
    deepStrictEqual(Object.keys(body), ['Zoprtr'])
  })

  it('converts dates and numbers by column type', () => {
    // index 2 ZtfDate is a date, 19 Zquantity is a number, 4 Zoprtr is text.
    const body = buildRowPayload(
      row({ 2: 45000, 19: '1234.5', 4: 'OPS' }),
      '',
      '',
      false,
      BUSINESS_UNITS,
      [],
    )
    strictEqual(body['ZtfDate'], '2023-03-15')
    strictEqual(body['Zquantity'], 1234.5)
    strictEqual(body['Zoprtr'], 'OPS')
  })

  it('skips a date cell it cannot parse rather than sending junk', () => {
    const body = buildRowPayload(row({ 2: 'sometime' }), '', '', false, BUSINESS_UNITS, [])
    strictEqual('ZtfDate' in body, false)
  })

  it('applies the selected business unit and TF type to every row', () => {
    const body = buildRowPayload(row({ 4: 'OPS' }), 'B02', '01', false, BUSINESS_UNITS, [])
    strictEqual(body['ZbuId'], 'B02')
    strictEqual(body['ZtfType'], '01')
  })

  it('on create, resolves the BU name from master data and overrides the sheet', () => {
    const body = buildRowPayload(row({ 3: 'WHATEVER' }), 'B02', '01', true, BUSINESS_UNITS, [])
    strictEqual(body['Zbu'], 'RICE')
  })

  it('on update, keeps the sheet’s own business unit text', () => {
    const body = buildRowPayload(row({ 3: 'WHATEVER' }), 'B02', '01', false, BUSINESS_UNITS, [])
    strictEqual(body['Zbu'], 'WHATEVER')
  })

  it('enriches from the commodity master when BU Commodity matches', () => {
    // index 6 is Zcmmd.
    const body = buildRowPayload(row({ 6: 'RICE-LG' }), '', '', false, BUSINESS_UNITS, COMMODITIES)
    strictEqual(body['ZtrmComId'], 'C1')
    strictEqual(body['ZtrmComDesc'], 'Long Grain Rice')
    strictEqual(body['ZchName1'], 'RICE-LG')
    strictEqual(body['ZchName2'], 'RICELG')
  })

  it('adds no commodity fields when nothing matches', () => {
    const body = buildRowPayload(row({ 6: 'UNKNOWN' }), '', '', false, BUSINESS_UNITS, COMMODITIES)
    strictEqual('ZtrmComId' in body, false)
  })
})

describe('TF_FIELD_MAP', () => {
  it('has one entry per template column', () => {
    strictEqual(TF_FIELD_MAP.length, 45)
  })

  it('maps the two deliberately counter-intuitive columns', () => {
    // The DDIC labels disagree with the technical names here; this is the whole reason the
    // map exists, so it is pinned.
    strictEqual(TF_FIELD_MAP[20]?.field, 'Zunit') // labelled "Contract Price"
    strictEqual(TF_FIELD_MAP[21]?.field, 'Zcprice') // labelled "CMP (MT)"
  })

  it('uses no field name twice', () => {
    strictEqual(new Set(TF_FIELD_MAP.map((f) => f.field)).size, TF_FIELD_MAP.length)
  })
})

describe('SAP DATS dates', () => {
  it('reads an 8-digit YYYYMMDD, as a number or as text', () => {
    strictEqual(datsToIso(20241218), '2024-12-18')
    strictEqual(datsToIso('20241125'), '2024-11-25')
  })

  it('takes DATS before the Excel serial reading, which would put it in the year 57,000-odd', () => {
    strictEqual(toIsoDate(20241218), '2024-12-18')
    strictEqual(toIsoDate(45000), '2023-03-15')
  })

  it('treats the placeholder an SAP export writes for an empty date as no date', () => {
    strictEqual(toIsoDate('0001-01-02'), null)
    strictEqual(toIsoDate('0001-01-01'), null)
    strictEqual(toIsoDate(10102), '1927-08-28')
  })

  it('refuses a month or day out of range', () => {
    strictEqual(datsToIso(20241318), null)
    strictEqual(datsToIso(20241200), null)
    strictEqual(datsToIso(2024121), null)
  })

  it('shows a DATS cell in the preview as DD-MM-YYYY', () => {
    strictEqual(displayCell(20241218, 0, [{ index: 0, name: 'TF Upload Date', type: 'date' }]), '18-12-2024')
  })
})

describe('createKey', () => {
  it('leaves the Trade Flow ID to the SNRO range and writes split 01, as SAP does', () => {
    deepStrictEqual(createKey(), { ZtfNo: '', ZtfSplit: '01' })
  })

  it('treats every blank-ID row as a create of its own, whatever its TF Split ID', () => {
    // The RICE workbook: 01, 02, 01, 01 with no Trade Flow ID. Four rows, four creates, so
    // four numbers — none of them shares the number issued to the row above.
    const rows: CellValue[][] = [['', '01'], ['', '02'], ['', '01'], ['', '01']]
    deepStrictEqual(rows.map(isCreateRow), [true, true, true, true])
  })
})

describe('buildBlPayload', () => {
  const tradeFlow = {
    Zbu: 'RICE',
    ZblVsslName: 'MV SUPRA BARON V.24001',
    Zsldate: '2024-11-25',
    Zquantity: 3000,
    ZbuId: 'B02',
    Zremark: 'ALLOCATED TO BDB/BCI SOFISA DEAL',
  }

  it('keys the BL under its trade flow and leaves the BL number to the SNRO range', () => {
    const bl = buildBlPayload(tradeFlow, '3000000018', '01')
    strictEqual(bl['ZtfNo'], '3000000018')
    strictEqual(bl['ZtfSplit'], '01')
    strictEqual(bl['ZblNo'], '')
    strictEqual(bl['ZblSplit'], '01')
    strictEqual(bl['ZblReuse'], '')
  })

  it('creates the BL in status 01, BL Created', () => {
    strictEqual(buildBlPayload(tradeFlow, '3000000018', '01')['ZblStatId'], '01')
  })

  it('dates the BL on the Sailing Date', () => {
    strictEqual(buildBlPayload(tradeFlow, '3000000018', '01')['ZblDate'], '2024-11-25')
    strictEqual(buildBlPayload({ ...tradeFlow, Zsldate: '' }, '3000000018', '01')['ZblDate'], undefined)
  })

  it('carries the trade flow fields the BL repeats', () => {
    const bl = buildBlPayload(tradeFlow, '3000000018', '01')
    strictEqual(bl['ZblVsslName'], 'MV SUPRA BARON V.24001')
    strictEqual(bl['Zquantity'], 3000)
  })

  it('cuts the columns ZSGTSFTR_BL holds narrower, as a SAP MOVE would', () => {
    const bl = buildBlPayload({ ...tradeFlow, Zbu: 'X'.repeat(30), Zremark: 'R'.repeat(250) }, '3000000018', '01')
    strictEqual(String(bl['Zbu']).length, 20)
    strictEqual(String(bl['Zremark']).length, 80)
  })

  it('does not change the trade flow payload it was given', () => {
    const copy = { ...tradeFlow, Zremark: 'R'.repeat(250) }
    buildBlPayload(copy, '3000000018', '01')
    strictEqual(copy.Zremark.length, 250)
  })
})

describe('TF_FIELD_MAP tail columns', () => {
  it('puts the last four workbook columns in the ZSGTSFTR_TRDFLOW columns SE11 names for them', () => {
    // AP Blocked Status Desc, AQ OGBS Status Desc, AR POL Country, AS POD Country.
    deepStrictEqual(
      TF_FIELD_MAP.slice(41).map((f) => f.field),
      ['ZflwStas2', 'ZogbsStatDesc', 'ZpolCtry', 'ZpodCtry'],
    )
  })

  it('never sends a workbook cell to a status code column', () => {
    const fields = TF_FIELD_MAP.map((f) => f.field)
    strictEqual(fields.includes('ZogbsStatId'), false)
    strictEqual(fields.includes('ZflwCod1'), false)
    strictEqual(fields.includes('ZflwCod2'), false)
  })
})

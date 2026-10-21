import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BASIC_FIELDS,
  BASIC_SECTIONS,
  PURCH_SALES_SECTIONS,
  SHIPPING_FIELDS,
  SHIPPING_SECTIONS,
  STATUS_FIELDS,
  STATUS_SECTIONS,
  distinctValues,
  filterRows,
  rowKey,
  sortRows,
  subtotal,
  withCpmtAmount,
  withDerivedFields,
} from './fields.ts'
import { EMPTY_FILTERS } from './types.ts'
import type { TrdFlowRow } from './types.ts'
import { assignmentCommodityError, dealCommodity } from './assignmentCommodity.ts'

const ROWS: TrdFlowRow[] = [
  { ZtfNo: '0000000001', ZtfSplit: '01', Zbu: 'B01', Zcmmd: 'C106', ZflwCod1: '01', Zttv: 1000 },
  { ZtfNo: '0000000002', ZtfSplit: '01', Zbu: 'B02', Zcmmd: 'C108', ZflwCod1: '02', Zttv: 250.5 },
  { ZtfNo: '0000000003', ZtfSplit: '02', Zbu: 'B01', Zcmmd: 'C106' },
]

describe('filterRows', () => {
  it('returns every row when no filter is set', () => {
    strictEqual(filterRows(ROWS, EMPTY_FILTERS).length, 3)
  })

  it('matches exactly, ignoring case', () => {
    const out = filterRows(ROWS, { ...EMPTY_FILTERS, Zcmmd: 'c106' })
    deepStrictEqual(
      out.map((r) => r.ZtfNo),
      ['0000000001', '0000000003'],
    )
  })

  it('does not match on a partial value', () => {
    strictEqual(filterRows(ROWS, { ...EMPTY_FILTERS, Zcmmd: 'C10' }).length, 0)
  })

  it('ands multiple filters together', () => {
    const out = filterRows(ROWS, { ...EMPTY_FILTERS, Zbu: 'B01', Zcmmd: 'C106' })
    strictEqual(out.length, 2)
  })

  it('filters on Blocked Status (ZFLW_COD2)', () => {
    const rows = [{ ...ROWS[0], ZflwCod2: '12' }, { ...ROWS[1], ZflwCod2: '' }] as typeof ROWS
    deepStrictEqual(filterRows(rows, { ...EMPTY_FILTERS, ZflwCod2: '12' }).map((r) => r.ZtfNo), [ROWS[0]!.ZtfNo])
  })

  it('treats a row missing the filtered field as not matching', () => {
    const out = filterRows(ROWS, { ...EMPTY_FILTERS, ZflwCod1: '02' })
    deepStrictEqual(
      out.map((r) => r.ZtfNo),
      ['0000000002'],
    )
  })
})

describe('distinctValues', () => {
  it('collects distinct non-empty values, sorted', () => {
    deepStrictEqual(distinctValues(ROWS, 'Zbu'), ['B01', 'B02'])
    deepStrictEqual(distinctValues(ROWS, 'Zcmmd'), ['C106', 'C108'])
  })

  it('skips rows where the field is absent', () => {
    deepStrictEqual(distinctValues(ROWS, 'ZflwCod1'), ['01', '02'])
  })

  it('is empty when no row carries the field', () => {
    deepStrictEqual(distinctValues(ROWS, 'Zoprtr'), [])
  })
})

describe('subtotal', () => {
  it('sums Zttv across rows, ignoring rows without it', () => {
    strictEqual(subtotal(ROWS), 1250.5)
  })

  it('is zero for an empty list', () => {
    strictEqual(subtotal([]), 0)
  })
})

describe('sortRows', () => {
  it('sorts a numeric column ascending and descending', () => {
    const asc = sortRows(ROWS, 'Zttv', 'asc', 'num')
    deepStrictEqual(asc.map((r) => r.ZtfNo), ['0000000002', '0000000001', '0000000003'])
    const desc = sortRows(ROWS, 'Zttv', 'desc', 'num')
    deepStrictEqual(desc.map((r) => r.ZtfNo), ['0000000001', '0000000002', '0000000003'])
  })

  it('sorts a text column as text', () => {
    const asc = sortRows(ROWS, 'Zbu', 'asc')
    deepStrictEqual(asc.map((r) => r.ZtfNo), ['0000000001', '0000000003', '0000000002'])
  })

  it('always sorts rows missing the field last, in either direction', () => {
    const asc = sortRows(ROWS, 'Zttv', 'asc', 'num')
    strictEqual(asc[asc.length - 1]!.ZtfNo, '0000000003')
    const desc = sortRows(ROWS, 'Zttv', 'desc', 'num')
    strictEqual(desc[desc.length - 1]!.ZtfNo, '0000000003')
  })

  it('does not mutate the input array', () => {
    const copy = [...ROWS]
    sortRows(ROWS, 'Zttv', 'asc', 'num')
    deepStrictEqual(ROWS, copy)
  })
})

describe('rowKey', () => {
  it('builds the composite key', () => {
    deepStrictEqual(rowKey(ROWS[0]!), { ZtfNo: '0000000001', ZtfSplit: '01' })
  })

  it('returns null when either half is missing', () => {
    strictEqual(rowKey({ ZtfNo: '1' }), null)
    strictEqual(rowKey({ ZtfSplit: '01' }), null)
  })
})

describe('section structure matches legacy/Manage TF.html', () => {
  /** Headings and grid classes read out of the original tab panels. */
  const EXPECTED = {
    basicData: [
      ['Basic Data', 'grid6', 6],
      ['Invoice Data', 'grid5', 5],
      ['Other Data', 'grid5', 2],
    ],
    shippingData: [
      ['Shipping Data', 'grid4', 12],
      ['Title With OIL', 'grid4', 2],
      ['BL Data', 'grid4', 6],
    ],
    purchSalesData: [
      ['Purchase Leg', 'grid3', 7],
      ['Sales Leg', 'grid3', 6],
    ],
    statusTab: [
      ['Status Details', 'grid5', 2],
      ['Blocked-Allocated Status', 'grid5', 10],
      ['TF Status Details', 'grid5', 9],
    ],
  } as const

  const ACTUAL = {
    basicData: BASIC_SECTIONS,
    shippingData: SHIPPING_SECTIONS,
    purchSalesData: PURCH_SALES_SECTIONS,
    statusTab: STATUS_SECTIONS,
  }

  for (const [tab, expected] of Object.entries(EXPECTED)) {
    it(`${tab} has the original's sections, grid classes and field counts`, () => {
      const actual = ACTUAL[tab as keyof typeof ACTUAL]
      deepStrictEqual(
        actual.map((s) => [s.heading, s.grid, s.fields.length]),
        expected.map((e) => [...e]),
      )
    })
  }

  it('gives every field a unique id across all tabs', () => {
    const ids = [
      ...BASIC_SECTIONS,
      ...SHIPPING_SECTIONS,
      ...PURCH_SALES_SECTIONS,
      ...STATUS_SECTIONS,
    ].flatMap((s) => s.fields.map((f) => f.id))
    strictEqual(new Set(ids).size, ids.length)
  })

  it('marks the original selects as selects, plus OTTK No/DTTK No/Deal ID — deliberately turned into selects fed by their own live masters, unlike the legacy free-text fields', () => {
    const selects = [
      ...BASIC_SECTIONS,
      ...STATUS_SECTIONS,
    ]
      .flatMap((s) => s.fields)
      .filter((f) => f.control === 'select')
      .map((f) => f.id)
      .sort()
    deepStrictEqual(selects, [
      'bdGtCommod',
      'odTfType',
      'stBlockedStatus',
      'stDealId',
      'stDttkNo',
      'stOgbsStatus',
      'stOttkNo',
      'stTfStatus',
    ])
  })

  it('leaves Deal ID editable — it is no longer read-only now that it is a select', () => {
    const stDealId = STATUS_FIELDS.find((f) => f.id === 'stDealId')
    strictEqual(stDealId?.readOnly, undefined)
  })
})

describe('field descriptors', () => {
  it('selects the GT code checked by FX assignment without changing the BU commodity text', () => {
    const field = BASIC_FIELDS.find((f) => f.id === 'bdGtCommod')?.field
    strictEqual(field, 'ZtrmComId')
    const row: TrdFlowRow = { Zcmmd: 'WHEAT', ZtrmComId: '' }
    const edited = withDerivedFields({ ...row, [field!]: 'C106' }, field!)
    strictEqual(edited.Zcmmd, 'WHEAT')
    strictEqual(edited.ZtrmComId, 'C106')
    const deal = dealCommodity(
      { ZDEAL_ID: '7000000019', ZDEAL_TYPE: 'FX', ZMC_REF: '2000000032' },
      { ZCOMMODITY: 'C106' },
    )
    strictEqual(assignmentCommodityError(deal, edited.ZtrmComId!), '')
  })

  it('maps the shipping fields the spec lists as live', () => {
    const byId = new Map(SHIPPING_FIELDS.map((f) => [f.id, f.field]))
    strictEqual(byId.get('shVessel'), 'ZblVsslName')
    strictEqual(byId.get('shLoadPort'), 'Zpol')
    strictEqual(byId.get('shPodCountry'), 'ZpodCtry')
    strictEqual(byId.get('shSailingDate'), 'Zsldate')
    strictEqual(byId.get('shLcDetails'), 'Zlc')
  })

  it('leaves the fields with no source unmapped', () => {
    const unmapped = [...BASIC_FIELDS, ...SHIPPING_FIELDS, ...STATUS_FIELDS]
      .filter((f) => f.field === undefined && !f.derived)
      .map((f) => f.id)
    strictEqual(unmapped.includes('shSustain'), true)
  })

  it('maps the fields ZSGTSFTR_TRDFLOW has columns for, which the OData service did not expose', () => {
    const byId = new Map([...BASIC_FIELDS, ...STATUS_FIELDS].map((f) => [f.id, f.field]))
    strictEqual(byId.get('bdChild1'), 'ZchName1')
    strictEqual(byId.get('bdBuCode'), 'ZbuId')
    strictEqual(byId.get('stOgbsRemarks'), 'Zremark')
    strictEqual(byId.get('stBlockedAmount'), 'Zamt')
    strictEqual(byId.get('stBlockedFrom'), 'ZblkFrom')
    strictEqual(byId.get('stCreatedBy'), 'ZcreatedBy')
  })

  it('maps the three status selects to their SE11 columns', () => {
    const byId = new Map(STATUS_FIELDS.map((f) => [f.id, f.field]))
    strictEqual(byId.get('stTfStatus'), 'ZflwCod1')
    strictEqual(byId.get('stBlockedStatus'), 'ZflwCod2')
    strictEqual(byId.get('stOgbsStatus'), 'ZogbsStatId')
    strictEqual(byId.get('stTrader'), 'ZfoTrader')
  })
})

describe('price fields', () => {
  // The upload writes workbook column U "Contract Price" to ZUNIT and V "CMP (MT)" to ZCPRICE
  // (TF_FIELD_MAP, by SE11 label). The popup must read them back the same way, or it shows the
  // market price as the contract price and Qty x Contract Price no longer equals Contract Amount.
  it('binds Contract Price to Zunit and Current Market Price to Zcprice', () => {
    strictEqual(BASIC_FIELDS.find((f) => f.id === 'idContractPrice')?.field, 'Zunit')
    strictEqual(BASIC_FIELDS.find((f) => f.id === 'idCmp')?.field, 'Zcprice')
  })
})

describe('withDerivedFields', () => {
  const tf = { Zquantity: 610, Zunit: 7185.5, Zcprice: 7168.25, Zttv: 4383155, ZcpmAmt: 0, Zsldate: '2026-09-20', ZetaDsPort: '2026-10-08', Zdays: '18' }

  it('recomputes Contract Amount from Quantity x Contract Price', () => {
    strictEqual(withDerivedFields({ ...tf, Zunit: '7200.5' as unknown as number }, 'Zunit').Zttv, 4392305)
  })
  it('recomputes CPMT Amount from Quantity x Current Market Price', () => {
    strictEqual(withDerivedFields({ ...tf, Zcprice: '7150.25' as unknown as number }, 'Zcprice').ZcpmAmt, 4361652.5)
  })
  it('recomputes Transit time from the two dates, blank when ETA is before sailing', () => {
    strictEqual(withDerivedFields({ ...tf, ZetaDsPort: '2026-10-10' }, 'ZetaDsPort').Zdays, '20')
    strictEqual(withDerivedFields({ ...tf, ZetaDsPort: '2026-09-01' }, 'ZetaDsPort').Zdays, '')
  })
  it('leaves the amount alone while the price is not a number', () => {
    strictEqual(withDerivedFields({ ...tf, Zunit: 'abc' as unknown as number }, 'Zunit').Zttv, 4383155)
  })
  it('touches nothing for an unrelated field', () => {
    deepStrictEqual(withDerivedFields({ ...tf, ZchName1: 'X' }, 'ZchName1'), { ...tf, ZchName1: 'X' })
  })
})

describe('withCpmtAmount', () => {
  it('fills in CPMT Amount from Quantity x Current Market Price, e.g. a row stored with 0', () => {
    strictEqual(withCpmtAmount({ Zquantity: 2000, Zcprice: 400, ZcpmAmt: 0 }).ZcpmAmt, 800000)
  })

  it('leaves Contract Amount and every other field exactly as stored', () => {
    const row = { Zquantity: 2000, Zcprice: 400, Zunit: 999, Zttv: 111, ZcpmAmt: 0, Zbu: 'B01' }
    deepStrictEqual(withCpmtAmount(row), { ...row, ZcpmAmt: 800000 })
  })

  it('leaves ZcpmAmt alone when Quantity or Current Market Price is missing', () => {
    deepStrictEqual(withCpmtAmount({ Zcprice: 400, ZcpmAmt: 0 }), { Zcprice: 400, ZcpmAmt: 0 })
    deepStrictEqual(withCpmtAmount({ Zquantity: 2000, ZcpmAmt: 0 }), { Zquantity: 2000, ZcpmAmt: 0 })
  })
})
